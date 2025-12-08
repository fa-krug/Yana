/**
 * Aggregation service.
 *
 * Handles feed and article aggregation using task queue.
 */

import { eq, and } from "drizzle-orm";
import { db, feeds, articles } from "../db";
import { getAggregatorById } from "../aggregators/registry";
import { enqueueTask } from "./taskQueue.service";
import { logger } from "../utils/logger";
import { NotFoundError } from "../errors";
import type { Feed, Article, User } from "../db/types";
import type { RawArticle } from "../aggregators/base/types";

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
  const { tasks } = await import("../db");
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
  const [feed] = await db
    .select()
    .from(feeds)
    .where(eq(feeds.id, feedId))
    .limit(1);

  if (!feed) {
    throw new NotFoundError(`Feed with id ${feedId} not found`);
  }

  // Get aggregator
  const aggregator = getAggregatorById(feed.aggregator);
  if (!aggregator) {
    throw new Error(`Aggregator '${feed.aggregator}' not found`);
  }

  // Get existing article URLs if not forcing refresh (to skip fetching content for existing articles)
  let existingUrls: Set<string> | null = null;
  if (!forceRefresh) {
    const existingArticles = await db
      .select({ url: articles.url })
      .from(articles)
      .where(eq(articles.feedId, feed.id));
    existingUrls = new Set(existingArticles.map((a) => a.url));
    logger.debug(
      { feedId, existingCount: existingUrls.size },
      "Loaded existing article URLs to skip content fetching",
    );
  }

  // Initialize aggregator
  aggregator.initialize(
    feed,
    forceRefresh,
    feed.aggregatorOptions as Record<string, unknown>,
  );

  // Set existing URLs so aggregator can skip fetching content for them
  if (
    existingUrls &&
    "setExistingUrls" in aggregator &&
    typeof aggregator.setExistingUrls === "function"
  ) {
    aggregator.setExistingUrls(existingUrls);
  }

  // Calculate dynamic daily limit if aggregator supports it
  let articleLimit: number | undefined = undefined;
  if (
    "getDynamicFetchLimit" in aggregator &&
    typeof aggregator.getDynamicFetchLimit === "function"
  ) {
    try {
      articleLimit = await aggregator.getDynamicFetchLimit(forceRefresh);
      logger.debug(
        { feedId, articleLimit, forceRefresh },
        "Calculated dynamic daily limit for aggregation",
      );
    } catch (error) {
      logger.warn(
        { error, feedId },
        "Failed to calculate dynamic daily limit, proceeding without limit",
      );
    }
  }

  // Run aggregation
  const rawArticles = await aggregator.aggregate(articleLimit);

  let articlesCreated = 0;
  let articlesUpdated = 0;

  // Save articles
  for (const rawArticle of rawArticles) {
    try {
      // Check if article exists in this feed
      const [existing] = await db
        .select()
        .from(articles)
        .where(
          and(eq(articles.url, rawArticle.url), eq(articles.feedId, feed.id)),
        )
        .limit(1);

      // Collect thumbnail if missing and convert to base64
      let thumbnailBase64 = rawArticle.thumbnailUrl
        ? await (
            await import("../aggregators/base/utils")
          ).convertThumbnailUrlToBase64(rawArticle.thumbnailUrl)
        : null;

      if (!thumbnailBase64) {
        const { extractThumbnailUrlFromPageAndConvertToBase64 } =
          await import("../aggregators/base/utils");
        thumbnailBase64 =
          (await extractThumbnailUrlFromPageAndConvertToBase64(
            rawArticle.url,
          )) || null;
        if (thumbnailBase64) {
          logger.debug(
            { url: rawArticle.url },
            "Extracted and converted thumbnail to base64 during aggregation",
          );
        }
      }

      if (existing) {
        if (forceRefresh) {
          // Force refresh: Update existing article
          await db
            .update(articles)
            .set({
              name: rawArticle.title,
              content: rawArticle.content || "",
              date: rawArticle.published,
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
            .where(eq(articles.id, existing.id));

          articlesUpdated++;
        }
        // Normal fetch: Skip existing articles, only add new ones
        continue;
      }

      // Create new article
      await db.insert(articles).values({
        feedId: feed.id,
        name: rawArticle.title,
        url: rawArticle.url,
        date: rawArticle.published,
        content: rawArticle.content || "",
        author: rawArticle.author || null,
        externalId: rawArticle.externalId || null,
        score: rawArticle.score || null,
        thumbnailUrl: thumbnailBase64 || null,
        mediaUrl: rawArticle.mediaUrl || null,
        duration: rawArticle.duration || null,
        viewCount: rawArticle.viewCount || null,
        mediaType: rawArticle.mediaType || null,
        aiProcessed: false,
        aiError: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      articlesCreated++;
    } catch (error) {
      logger.error({ error, url: rawArticle.url }, "Failed to save article");
      continue;
    }
  }

  logger.info(
    { feedId, articlesCreated, articlesUpdated },
    "Feed aggregation completed",
  );

  return { articlesCreated, articlesUpdated };
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

  // Get aggregator
  const aggregator = getAggregatorById(feed.aggregator);
  if (!aggregator) {
    throw new Error(`Aggregator '${feed.aggregator}' not found`);
  }

  // Initialize aggregator
  aggregator.initialize(
    feed,
    true,
    feed.aggregatorOptions as Record<string, unknown>,
  );

  // Fetch article content
  const { fetchArticleContent } = await import("../aggregators/base/fetch");
  const html = await fetchArticleContent(article.url, {
    timeout: aggregator.fetchTimeout,
    waitForSelector: aggregator.waitForSelector,
  });

  // Extract and process content
  const { extractContent } = await import("../aggregators/base/extract");
  const { processContent } = await import("../aggregators/base/process");

  const extracted = extractContent(html, {
    selectorsToRemove: aggregator.selectorsToRemove,
  });

  // Create RawArticle from database article
  const rawArticle: RawArticle = {
    title: article.name,
    url: article.url,
    published: article.date,
    author: article.author || undefined,
    externalId: article.externalId || undefined,
    score: article.score || undefined,
    thumbnailUrl: article.thumbnailUrl || undefined,
    mediaUrl: article.mediaUrl || undefined,
    duration: article.duration || undefined,
    viewCount: article.viewCount || undefined,
    mediaType: article.mediaType || undefined,
  };

  const processed = await processContent(extracted, rawArticle);

  // Collect thumbnail if missing and convert to base64
  let thumbnailBase64 = rawArticle.thumbnailUrl
    ? await (
        await import("../aggregators/base/utils")
      ).convertThumbnailUrlToBase64(rawArticle.thumbnailUrl)
    : null;

  if (!thumbnailBase64) {
    const { extractThumbnailUrlFromPageAndConvertToBase64 } =
      await import("../aggregators/base/utils");
    thumbnailBase64 =
      (await extractThumbnailUrlFromPageAndConvertToBase64(article.url)) ||
      null;
    if (thumbnailBase64) {
      logger.debug(
        { articleId },
        "Extracted and converted thumbnail to base64 during reload",
      );
    }
  }

  // Update article
  await db
    .update(articles)
    .set({
      content: processed,
      thumbnailUrl: thumbnailBase64 || null,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));

  logger.info({ articleId }, "Article reloaded");
}
