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
import { shouldSkipArticleByDuplicate } from "../aggregators/base/utils";

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

  // Update feed icon if aggregator provides one
  // First, try the new collectFeedIcon() method
  try {
    const feedIconUrl = await aggregator.collectFeedIcon();
    if (feedIconUrl) {
      const { convertThumbnailUrlToBase64 } =
        await import("../aggregators/base/utils");
      const iconBase64 = await convertThumbnailUrlToBase64(feedIconUrl);
      if (iconBase64) {
        await db
          .update(feeds)
          .set({ icon: iconBase64 })
          .where(eq(feeds.id, feed.id));
        logger.info(
          { feedId: feed.id, aggregator: aggregator.id },
          "Updated feed icon from aggregator",
        );
      }
    }
  } catch (error) {
    logger.warn(
      { error, feedId: feed.id, aggregator: aggregator.id },
      "Failed to collect feed icon from aggregator",
    );
  }

  // Legacy support: Update feed icon if aggregator provides one via private properties
  // (for backwards compatibility with Reddit and YouTube)
  if ((aggregator as any).__subredditIconUrl) {
    try {
      const subredditIconUrl = (aggregator as any).__subredditIconUrl;
      if (subredditIconUrl) {
        const { convertThumbnailUrlToBase64 } =
          await import("../aggregators/base/utils");
        const iconBase64 = await convertThumbnailUrlToBase64(subredditIconUrl);
        if (iconBase64) {
          await db
            .update(feeds)
            .set({ icon: iconBase64 })
            .where(eq(feeds.id, feed.id));
          logger.info(
            { feedId: feed.id },
            "Updated feed icon from subreddit thumbnail (legacy)",
          );
        }
      }
    } catch (error) {
      logger.warn(
        { error, feedId: feed.id },
        "Failed to update feed icon from subreddit (legacy)",
      );
    }
  }

  // Legacy support: Update feed icon for YouTube channels
  if ((aggregator as any).__channelIconUrl) {
    try {
      const channelIconUrl = (aggregator as any).__channelIconUrl;
      if (channelIconUrl) {
        const { convertThumbnailUrlToBase64 } =
          await import("../aggregators/base/utils");
        const iconBase64 = await convertThumbnailUrlToBase64(channelIconUrl);
        if (iconBase64) {
          await db
            .update(feeds)
            .set({ icon: iconBase64 })
            .where(eq(feeds.id, feed.id));
          logger.info(
            { feedId: feed.id },
            "Updated feed icon from YouTube channel thumbnail (legacy)",
          );
        }
      }
    } catch (error) {
      logger.warn(
        { error, feedId: feed.id },
        "Failed to update feed icon from YouTube channel (legacy)",
      );
    }
  }

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
        continue;
      }

      // Check if article should be skipped due to duplicates
      const { shouldSkip, reason } = await shouldSkipArticleByDuplicate(
        { url: rawArticle.url, title: rawArticle.title },
        feed.id,
        forceRefresh,
      );

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

      // Check if article exists in this feed (for force refresh updates)
      const [existing] = await db
        .select()
        .from(articles)
        .where(
          and(eq(articles.url, rawArticle.url), eq(articles.feedId, feed.id)),
        )
        .limit(1);

      const articleDate = feed.useCurrentTimestamp
        ? new Date()
        : (rawArticle.published ?? new Date());

      if (existing) {
        if (forceRefresh) {
          // Force refresh: Update existing article
          // Only process thumbnail if we're actually updating
          let thumbnailBase64 = rawArticle.thumbnailUrl?.startsWith("data:")
            ? rawArticle.thumbnailUrl
            : rawArticle.thumbnailUrl
              ? await (
                  await import("../aggregators/base/utils")
                ).convertThumbnailUrlToBase64(rawArticle.thumbnailUrl)
              : null;

          if (!thumbnailBase64) {
            // Use aggregator's thumbnail extraction method (can be overridden)
            const thumbnailUrl = await aggregator.extractThumbnailFromUrl(
              rawArticle.url,
            );
            if (thumbnailUrl) {
              const { convertThumbnailUrlToBase64 } =
                await import("../aggregators/base/utils");
              thumbnailBase64 = await convertThumbnailUrlToBase64(thumbnailUrl);
            }

            // Fallback: try to extract base64 image from content
            if (!thumbnailBase64 && rawArticle.content) {
              const { extractBase64ImageFromContent } =
                await import("../aggregators/base/utils");
              thumbnailBase64 = extractBase64ImageFromContent(
                rawArticle.content,
              );
            }
          }

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
        }
        // Normal fetch: Skip existing articles, only add new ones
        continue;
      }

      // Final check: Verify URL doesn't exist globally (race condition protection)
      // This prevents UNIQUE constraint errors if another process inserted the same URL
      // between the initial duplicate check and this point
      if (!forceRefresh) {
        const [existingByUrl] = await db
          .select()
          .from(articles)
          .where(eq(articles.url, rawArticle.url))
          .limit(1);

        if (existingByUrl) {
          logger.debug(
            { url: rawArticle.url, feedId: feed.id },
            "Article URL already exists (skipping duplicate detected before insert)",
          );
          continue;
        }
      }

      // Only process thumbnail if we're actually going to insert the article
      // Collect thumbnail if missing and convert to base64
      // If already a data URI (base64), use it directly
      let thumbnailBase64 = rawArticle.thumbnailUrl?.startsWith("data:")
        ? rawArticle.thumbnailUrl
        : rawArticle.thumbnailUrl
          ? await (
              await import("../aggregators/base/utils")
            ).convertThumbnailUrlToBase64(rawArticle.thumbnailUrl)
          : null;

      if (!thumbnailBase64) {
        // Use aggregator's thumbnail extraction method (can be overridden)
        const thumbnailUrl = await aggregator.extractThumbnailFromUrl(
          rawArticle.url,
        );
        if (thumbnailUrl) {
          const { convertThumbnailUrlToBase64 } =
            await import("../aggregators/base/utils");
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
            await import("../aggregators/base/utils");
          thumbnailBase64 = extractBase64ImageFromContent(rawArticle.content);
          if (thumbnailBase64) {
            logger.debug(
              { url: rawArticle.url },
              "Extracted base64 thumbnail from article content",
            );
          }
        }
      }

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
    } catch (error: any) {
      // Handle UNIQUE constraint errors gracefully (article already exists)
      // This is a fallback in case the final check above didn't catch it
      if (
        error?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        (error?.message && error.message.includes("UNIQUE constraint failed"))
      ) {
        logger.debug(
          { url: rawArticle.url, feedId: feed.id },
          "Article already exists (UNIQUE constraint - skipping duplicate)",
        );
        continue;
      }

      // Log other errors as actual failures
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

  // Fetch article content using aggregator's internal method (handles special cases like Oglaf)
  const rawArticleForFetch: RawArticle = {
    title: article.name,
    url: article.url,
    published: article.date,
  };
  const html = await (aggregator as any).fetchArticleContentInternal(
    article.url,
    rawArticleForFetch,
  );

  // Create RawArticle from database article
  // Preserve headerImageUrl if it was set by fetchArticleContentInternal (e.g., Reddit)
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
    ...((rawArticleForFetch as RawArticle & { headerImageUrl?: string })
      .headerImageUrl
      ? {
          headerImageUrl: (
            rawArticleForFetch as RawArticle & { headerImageUrl?: string }
          ).headerImageUrl,
        }
      : {}),
  };

  // Use aggregator's template method flow (extractContent + processContent)
  // This ensures generateTitleImage and addSourceFooter are respected
  const extracted = await (aggregator as any).extractContent(html, rawArticle);
  const processed = await (aggregator as any).processContent(
    extracted,
    rawArticle,
  );

  // Handle date according to feed.useCurrentTimestamp setting (same as processFeedAggregation)
  const articleDate = feed.useCurrentTimestamp
    ? new Date()
    : (rawArticle.published ?? article.date);

  // Collect thumbnail if missing and convert to base64
  // Use same logic as processFeedAggregation force refresh path
  let thumbnailBase64 = rawArticle.thumbnailUrl?.startsWith("data:")
    ? rawArticle.thumbnailUrl
    : rawArticle.thumbnailUrl
      ? await (
          await import("../aggregators/base/utils")
        ).convertThumbnailUrlToBase64(rawArticle.thumbnailUrl)
      : null;

  if (!thumbnailBase64) {
    // Use aggregator's thumbnail extraction method (can be overridden)
    const thumbnailUrl = await aggregator.extractThumbnailFromUrl(article.url);
    if (thumbnailUrl) {
      const { convertThumbnailUrlToBase64 } =
        await import("../aggregators/base/utils");
      thumbnailBase64 = await convertThumbnailUrlToBase64(thumbnailUrl);
      if (thumbnailBase64) {
        logger.debug(
          { articleId },
          "Extracted and converted thumbnail to base64 during reload",
        );
      }
    }

    // Fallback: try to extract base64 image from content (e.g., header image that was embedded)
    if (!thumbnailBase64 && processed) {
      const { extractBase64ImageFromContent } =
        await import("../aggregators/base/utils");
      thumbnailBase64 = extractBase64ImageFromContent(processed);
      if (thumbnailBase64) {
        logger.debug(
          { articleId },
          "Extracted base64 thumbnail from article content during reload",
        );
      }
    }
  }

  // Update article with all fields (same as processFeedAggregation force refresh)
  // This ensures all features are applied identically
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
