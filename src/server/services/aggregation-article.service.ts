/**
 * Aggregation article service - handles article saving during aggregation.
 */

import { eq, and } from "drizzle-orm";

import type { BaseAggregator } from "@server/aggregators/base/aggregator";
import type { RawArticle } from "@server/aggregators/base/types";
import { shouldSkipArticleByDuplicate } from "@server/aggregators/base/utils";
import { db, articles } from "@server/db";
import type { Feed } from "@server/db/types";
import { logger } from "@server/utils/logger";

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

  // Save articles
  for (const rawArticle of rawArticles) {
    try {
      const publishedDate = rawArticle.published
        ? new Date(rawArticle.published)
        : null;

      if (
        publishedDate &&
        !Number.isNaN(publishedDate.getTime()) &&
        publishedDate < publishedCutoffDate
      ) {
        logger.debug(
          {
            url: rawArticle.url,
            published: publishedDate.toISOString(),
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
            `[SAVE_TRACE] Article ${rawArticle.url} filtered: too old (${publishedDate.toISOString()} < ${publishedCutoffDate.toISOString()})`,
          );
        }
        continue;
      }

      // Check if article should be skipped due to duplicates or updated
      const { shouldSkip, shouldUpdate, reason, existingArticle } =
        await shouldSkipArticleByDuplicate(
          { url: rawArticle.url, title: rawArticle.title },
          feed.id,
          feed.userId,
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
        if (reason) {
          logger.debug(
            {
              url: rawArticle.url,
              name: rawArticle.title,
              feedId: feed.id,
              reason,
            },
            "Skipping duplicate article",
          );
        }
        // Don't log for existing URLs (too verbose)
        continue;
      }

      const articleDate = feed.useCurrentTimestamp
        ? new Date()
        : (rawArticle.published ?? new Date());

      // Update existing unread article
      if (shouldUpdate && existingArticle) {
        const thumbnailBase64 = await processThumbnail(rawArticle, aggregator);

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

        articlesUpdated++;
        continue;
      }

      // Force refresh: Update existing article if it exists
      if (forceRefresh) {
        const [existing] = await db
          .select()
          .from(articles)
          .where(
            and(eq(articles.url, rawArticle.url), eq(articles.feedId, feed.id)),
          )
          .limit(1);

        if (existing) {
          const thumbnailBase64 = await processThumbnail(
            rawArticle,
            aggregator,
          );

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
            .where(eq(articles.id, existing.id));

          articlesUpdated++;
          continue;
        }
      }

      // Process thumbnail
      const thumbnailBase64 = await processThumbnail(rawArticle, aggregator);

      // Create new article
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

      articlesCreated++;
    } catch (error: unknown) {
      // Log errors as actual failures
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
