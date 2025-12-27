/**
 * Aggregation service.
 *
 * Handles feed and article aggregation using task queue.
 */

import { eq, and } from "drizzle-orm";

import type { RawArticle } from "@server/aggregators/base/types";
import { getAggregatorById } from "@server/aggregators/registry";
import { db, feeds, articles } from "@server/db";
import { NotFoundError } from "@server/errors";
import { logger } from "@server/utils/logger";

import { saveAggregatedArticles } from "./aggregation-article.service";
import { collectFeedIcon } from "./aggregation-icon.service";
import {
  validateAndPrepareAggregation,
  loadExistingUrls,
  initializeAggregator,
  calculateArticleLimit,
} from "./aggregation-validation.service";
import {
  buildRawArticleFromDatabase,
  determineArticleDate,
  processThumbnailBase64,
} from "./article-reload-helpers";
import { enqueueTask } from "./taskQueue.service";

/**
 * Aggregate a single feed.
 */
export async function aggregateFeed(
  feedId: number,
  forceRefresh: boolean = false,
): Promise<{ taskId: number }> {
  // Verify feed exists
  const [feed] = await db
    .select()
    .from(feeds)
    .where(eq(feeds.id, feedId))
    .limit(1);

  if (!feed) {
    throw new NotFoundError(`Feed with id ${feedId} not found`);
  }

  if (!feed.enabled) {
    throw new Error("Feed is disabled");
  }

  // Enqueue aggregation task
  const task = await enqueueTask("aggregate_feed", {
    feedId,
    forceRefresh,
  });

  logger.info({ feedId, taskId: task.id }, "Feed aggregation enqueued");

  return { taskId: task.id };
}

/**
 * Aggregate all enabled feeds.
 */
export async function aggregateAllFeeds(): Promise<{ taskIds: number[] }> {
  const enabledFeeds = await db
    .select()
    .from(feeds)
    .where(eq(feeds.enabled, true));

  const taskIds: number[] = [];
  const { tasks } = await import("@server/db");
  const { inArray } = await import("drizzle-orm");

  // Get all existing pending/running aggregate_feed tasks
  const existingTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.type, "aggregate_feed"),
        inArray(tasks.status, ["pending", "running"]),
      ),
    );

  // Build a map of existing feedIds
  const existingFeedIds = new Set<number>();
  for (const task of existingTasks) {
    try {
      const payload =
        typeof task.payload === "string"
          ? JSON.parse(task.payload)
          : task.payload;
      if (payload.feedId) {
        existingFeedIds.add(payload.feedId as number);
      }
    } catch {
      // Skip invalid payloads
    }
  }

  for (const feed of enabledFeeds) {
    // Skip if there's already a pending/running task for this feed
    if (existingFeedIds.has(feed.id)) {
      logger.debug(
        { feedId: feed.id },
        "Feed aggregation already queued, skipping",
      );
      continue;
    }

    try {
      const task = await enqueueTask("aggregate_feed", {
        feedId: feed.id,
        forceRefresh: false,
      });
      taskIds.push(task.id);
      existingFeedIds.add(feed.id); // Track newly created tasks
    } catch (error) {
      logger.error(
        { error, feedId: feed.id },
        "Failed to enqueue feed aggregation",
      );
    }
  }

  logger.info({ count: taskIds.length }, "All feeds aggregation enqueued");

  return { taskIds };
}

/**
 * Process feed aggregation (called by worker).
 */
export async function processFeedAggregation(
  feedId: number,
  forceRefresh: boolean,
): Promise<{ articlesCreated: number; articlesUpdated: number }> {
  // Validate and prepare
  const { feed, aggregator } = await validateAndPrepareAggregation(feedId);

  // Load existing URLs if not forcing refresh
  const existingUrls = forceRefresh ? null : await loadExistingUrls(feedId);

  // Initialize aggregator
  initializeAggregator(aggregator, feed, forceRefresh, existingUrls);

  // Calculate dynamic article limit
  const articleLimit = await calculateArticleLimit(
    aggregator,
    feedId,
    forceRefresh,
  );

  // Run aggregation
  const rawArticles = await aggregator.aggregate(articleLimit);

  // Collect and update feed icon
  await collectFeedIcon(aggregator, feed);

  // Save articles
  const result = await saveAggregatedArticles(
    rawArticles,
    feed,
    aggregator,
    forceRefresh,
  );

  logger.info({ feedId, ...result }, "Feed aggregation completed");

  return result;
}

/**
 * Reload a single article.
 */
export async function reloadArticle(
  articleId: number,
): Promise<{ taskId: number }> {
  // Verify article exists
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    throw new NotFoundError(`Article with id ${articleId} not found`);
  }

  // Enqueue reload task
  const task = await enqueueTask("aggregate_article", {
    articleId,
  });

  logger.info({ articleId, taskId: task.id }, "Article reload enqueued");

  return { taskId: task.id };
}

/**
 * Process article reload (called by worker).
 */
export async function processArticleReload(articleId: number): Promise<void> {
  // 1. Load article and feed
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    throw new NotFoundError(`Article with id ${articleId} not found`);
  }

  const [feed] = await db
    .select()
    .from(feeds)
    .where(eq(feeds.id, article.feedId))
    .limit(1);

  if (!feed) {
    throw new NotFoundError("Feed not found");
  }

  // 2. Get and initialize aggregator
  const aggregator = getAggregatorById(feed.aggregator);
  if (!aggregator) {
    throw new Error(`Aggregator '${feed.aggregator}' not found`);
  }

  aggregator.initialize(
    feed,
    true,
    feed.aggregatorOptions as Record<string, unknown>,
  );

  // 3. Fetch and process article content
  const rawArticleForFetch: RawArticle = {
    title: article.name,
    url: article.url,
    published: article.date,
  };

  const aggregatorInstance = aggregator as unknown as {
    fetchArticleContentInternal: (
      url: string,
      article: RawArticle,
    ) => Promise<string>;
    extractContent: (html: string, article: RawArticle) => Promise<string>;
    processContent: (html: string, article: RawArticle) => Promise<string>;
  };

  const html = await aggregatorInstance.fetchArticleContentInternal(
    article.url,
    rawArticleForFetch,
  );

  // 4. Build raw article preserving header image from fetch
  const headerImageUrl = (
    rawArticleForFetch as RawArticle & { headerImageUrl?: string }
  ).headerImageUrl;
  const rawArticle = buildRawArticleFromDatabase(article, headerImageUrl);

  // 5. Extract and process content
  const extracted = await aggregatorInstance.extractContent(html, rawArticle);
  const processed = await aggregatorInstance.processContent(
    extracted,
    rawArticle,
  );

  // 6. Determine article date
  const articleDate = determineArticleDate(feed, rawArticle, article.date);

  // 7. Process thumbnail with fallbacks
  const thumbnailBase64 = await processThumbnailBase64(
    rawArticle,
    article,
    aggregator,
    processed,
  );

  // 8. Update article
  await db
    .update(articles)
    .set({
      name: rawArticle.title,
      content: processed,
      date: articleDate,
      author: rawArticle.author || null,
      externalId: rawArticle.externalId || null,
      score: rawArticle.score || null,
      thumbnailUrl: thumbnailBase64 || null,
      mediaUrl: rawArticle.mediaUrl || null,
      duration: rawArticle.duration || null,
      viewCount: rawArticle.viewCount || null,
      mediaType: rawArticle.mediaType || null,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));

  logger.info({ articleId }, "Article reloaded");
}
