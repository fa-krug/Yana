/**
 * Aggregation article service - handles article saving during aggregation.
 */

import { eq, and } from "drizzle-orm";

import type { BaseAggregator } from "@server/aggregators/base/aggregator";
import type { RawArticle } from "@server/aggregators/base/types";
import { shouldSkipArticleByDuplicate } from "@server/aggregators/base/utils";
import { db, articles } from "@server/db";
import type { Article, Feed } from "@server/db/types";
import { logger } from "@server/utils/logger";

/**
 * Determine if and how an article should be processed.
 */
interface ProcessingDecision {
  action: "skip" | "update" | "create";
  existingArticle?: Article;
  reason?: string;
}

/**
 * Check if article is too old (older than cutoff date).
 * Returns true if article should be skipped due to age.
 */
function isArticleTooOld(
  publishedDate: Date | null,
  cutoffDate: Date,
): boolean {
  if (!publishedDate || Number.isNaN(publishedDate.getTime())) {
    return false;
  }
  return publishedDate < cutoffDate;
}

/**
 * Determine if and how an article should be processed.
 */
async function determineProcessingAction(
  rawArticle: RawArticle,
  feedId: string,
  userId: number,
  forceRefresh: boolean,
): Promise<ProcessingDecision> {
  const { shouldSkip, shouldUpdate, reason, existingArticle } =
    await shouldSkipArticleByDuplicate(
      { url: rawArticle.url, title: rawArticle.title },
      feedId,
      userId,
      forceRefresh,
    );

  // INSTRUMENTATION: Log duplicate detection
  if (
    process.env["NODE_ENV"] === "test" &&
    (global as { __TEST_TRACE?: boolean }).__TEST_TRACE
  ) {
    console.log(
      `[SAVE_TRACE] Article ${rawArticle.url}: shouldSkip=${shouldSkip}, shouldUpdate=${shouldUpdate}, reason=${reason || "none"}`,
    );
  }

  if (shouldSkip) {
    return { action: "skip", reason };
  }

  if (shouldUpdate && existingArticle) {
    return { action: "update", existingArticle };
  }

  return { action: "create" };
}

/**
 * Update an existing article with new data.
 */
async function updateExistingArticle(
  rawArticle: RawArticle,
  feed: Feed,
  aggregator: BaseAggregator,
  existingArticle: Article,
): Promise<void> {
  const thumbnailBase64 = await processThumbnail(rawArticle, aggregator);
  const articleDate = feed.useCurrentTimestamp
    ? new Date()
    : (rawArticle.published ?? new Date());

  await db
    .update(articles)
    .set({
      name: rawArticle.title,
      content: rawArticle.content || "",
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
    .where(eq(articles.id, existingArticle.id));
}

/**
 * Handle force refresh scenario.
 * Returns true if article was updated, false if it needs to be created.
 */
async function handleForceRefresh(
  rawArticle: RawArticle,
  feed: Feed,
  aggregator: BaseAggregator,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(articles)
    .where(
      and(eq(articles.url, rawArticle.url), eq(articles.feedId, feed.id)),
    )
    .limit(1);

  if (existing) {
    await updateExistingArticle(rawArticle, feed, aggregator, existing);
    return true;
  }

  return false;
}

/**
 * Create a new article in the database.
 */
async function createNewArticle(
  rawArticle: RawArticle,
  feed: Feed,
  aggregator: BaseAggregator,
): Promise<void> {
  const thumbnailBase64 = await processThumbnail(rawArticle, aggregator);
  const articleDate = feed.useCurrentTimestamp
    ? new Date()
    : (rawArticle.published ?? new Date());

  await db.insert(articles).values({
    feedId: feed.id,
    name: rawArticle.title,
    url: rawArticle.url,
    date: articleDate,
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
}

/**
 * Process and save articles from aggregation.
 */
export async function saveAggregatedArticles(
  rawArticles: RawArticle[],
  feed: Feed,
  aggregator: BaseAggregator,
  forceRefresh: boolean,
): Promise<{ articlesCreated: number; articlesUpdated: number }> {
  let articlesCreated = 0;
  let articlesUpdated = 0;

  const publishedCutoffDate = new Date();
  publishedCutoffDate.setMonth(publishedCutoffDate.getMonth() - 2);

  for (const rawArticle of rawArticles) {
    try {
      // Check if article is too old
      const publishedDate = rawArticle.published
        ? new Date(rawArticle.published)
        : null;

      if (isArticleTooOld(publishedDate, publishedCutoffDate)) {
        logger.debug(
          {
            url: rawArticle.url,
            published: publishedDate?.toISOString(),
            feedId: feed.id,
          },
          "Skipping article older than two months",
        );
        // INSTRUMENTATION: Log when articles are filtered by date
        if (
          process.env["NODE_ENV"] === "test" &&
          (global as { __TEST_TRACE?: boolean }).__TEST_TRACE
        ) {
          console.log(
            `[SAVE_TRACE] Article ${rawArticle.url} filtered: too old (${publishedDate?.toISOString()} < ${publishedCutoffDate.toISOString()})`,
          );
        }
        continue;
      }

      // Determine processing action
      const decision = await determineProcessingAction(
        rawArticle,
        feed.id,
        feed.userId,
        forceRefresh,
      );

      if (decision.action === "skip") {
        if (decision.reason) {
          logger.debug(
            {
              url: rawArticle.url,
              name: rawArticle.title,
              feedId: feed.id,
              reason: decision.reason,
            },
            "Skipping duplicate article",
          );
        }
        continue;
      }

      if (decision.action === "update" && decision.existingArticle) {
        await updateExistingArticle(
          rawArticle,
          feed,
          aggregator,
          decision.existingArticle,
        );
        articlesUpdated++;
        continue;
      }

      // Handle force refresh scenario
      if (forceRefresh) {
        const wasUpdated = await handleForceRefresh(
          rawArticle,
          feed,
          aggregator,
        );
        if (wasUpdated) {
          articlesUpdated++;
          continue;
        }
      }

      // Create new article
      await createNewArticle(rawArticle, feed, aggregator);
      articlesCreated++;
    } catch (error: unknown) {
      logger.error({ error, url: rawArticle.url }, "Failed to save article");
      continue;
    }
  }

  return { articlesCreated, articlesUpdated };
}

/**
 * Process thumbnail for an article.
 */
async function processThumbnail(
  rawArticle: RawArticle,
  aggregator: BaseAggregator,
): Promise<string | null> {
  // If already a data URI (base64), use it directly
  let thumbnailBase64: string | null;
  if (rawArticle.thumbnailUrl?.startsWith("data:")) {
    thumbnailBase64 = rawArticle.thumbnailUrl;
  } else if (rawArticle.thumbnailUrl) {
    thumbnailBase64 = await (
      await import("@server/aggregators/base/utils")
    ).convertThumbnailUrlToBase64(rawArticle.thumbnailUrl);
  } else {
    thumbnailBase64 = null;
  }

  if (!thumbnailBase64) {
    // Use aggregator's thumbnail extraction method (can be overridden)
    const thumbnailUrl = await aggregator.extractThumbnailFromUrl(
      rawArticle.url,
    );
    if (thumbnailUrl) {
      const { convertThumbnailUrlToBase64 } =
        await import("@server/aggregators/base/utils");
      thumbnailBase64 = await convertThumbnailUrlToBase64(thumbnailUrl);
      if (thumbnailBase64) {
        logger.debug(
          { url: rawArticle.url },
          "Extracted and converted thumbnail to base64 during aggregation",
        );
      }
    }

    // Fallback: try to extract base64 image from content (e.g., header image that was embedded)
    if (!thumbnailBase64 && rawArticle.content) {
      const { extractBase64ImageFromContent } =
        await import("@server/aggregators/base/utils");
      thumbnailBase64 = extractBase64ImageFromContent(rawArticle.content);
      if (thumbnailBase64) {
        logger.debug(
          { url: rawArticle.url },
          "Extracted base64 thumbnail from article content",
        );
      }
    }
  }

  return thumbnailBase64;
}
