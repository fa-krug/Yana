/**
 * Feed service.
 *
 * Handles feed management operations.
 */

import { eq, and, or, isNull, desc, sql, like, inArray } from "drizzle-orm";
import { db, feeds, articles, userArticleStates } from "../db";
import { NotFoundError, PermissionDeniedError } from "../errors";
import { logger } from "../utils/logger";
import type { Feed, FeedInsert, User } from "../db/types";
import { getAggregatorById } from "../aggregators/registry";
import type { RawArticle } from "../aggregators/base/types";
import { getAggregatorMetadataById } from "./aggregator.service";

/**
 * Minimal user info needed for feed operations.
 */
type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * List feeds for a user.
 */
export async function listFeeds(
  user: UserInfo,
  filters: {
    search?: string;
    feedType?: string;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ feeds: Feed[]; total: number }> {
  const { search, feedType, enabled, page = 1, pageSize = 20 } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions = [
    // User can see their own feeds or shared feeds (user_id = null)
    or(eq(feeds.userId, user.id), isNull(feeds.userId)),
  ];

  if (search) {
    conditions.push(like(feeds.name, `%${search}%`));
  }

  if (feedType) {
    conditions.push(eq(feeds.feedType, feedType as any));
  }

  if (enabled !== undefined) {
    conditions.push(eq(feeds.enabled, enabled));
  }

  const whereClause = and(...conditions);

  // Get total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(feeds)
    .where(whereClause);

  const total = totalResult[0]?.count || 0;

  // Get feeds
  const feedList = await db
    .select()
    .from(feeds)
    .where(whereClause)
    .orderBy(desc(feeds.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { feeds: feedList, total };
}

/**
 * Get feed by ID.
 */
export async function getFeed(id: number, user: UserInfo): Promise<Feed> {
  const [feed] = await db.select().from(feeds).where(eq(feeds.id, id)).limit(1);

  if (!feed) {
    throw new NotFoundError(`Feed with id ${id} not found`);
  }

  // Check access: user must own feed or feed must be shared (user_id = null)
  if (feed.userId !== null && feed.userId !== user.id && !user.isSuperuser) {
    throw new PermissionDeniedError("You do not have access to this feed");
  }

  return feed;
}

/**
 * Get feed aggregator metadata.
 */
export async function getFeedAggregatorMetadata(
  feed: Feed,
): Promise<Record<string, unknown>> {
  const { getAggregatorMetadata } = await import("./aggregator.service");
  try {
    const metadata = getAggregatorMetadata(feed.aggregator);
    if (!metadata) {
      return {};
    }
    return {
      name: metadata.name,
      type: metadata.type,
      description: metadata.description,
      url: metadata.url,
      identifier_label: metadata.identifierLabel,
    };
  } catch {
    return {};
  }
}

/**
 * Get article count for a feed.
 */
export async function getFeedArticleCount(feedId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.feedId, feedId));

  return result[0]?.count || 0;
}

/**
 * Get unread article count for a feed and user.
 */
export async function getFeedUnreadCount(
  feedId: number,
  userId: number,
): Promise<number> {
  // Get all article IDs for this feed
  const feedArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.feedId, feedId));

  if (feedArticles.length === 0) {
    return 0;
  }

  const articleIds = feedArticles.map((a) => a.id);

  // Get read article IDs for this user
  const readStates = await db
    .select({ articleId: userArticleStates.articleId })
    .from(userArticleStates)
    .where(
      and(
        eq(userArticleStates.userId, userId),
        eq(userArticleStates.isRead, true),
        inArray(userArticleStates.articleId, articleIds),
      ),
    );

  const readIds = new Set(readStates.map((s) => s.articleId));

  // Count unread: articles that are not in the read list
  return articleIds.filter((id) => !readIds.has(id)).length;
}

/**
 * Filter out restricted options and AI features for managed aggregators.
 * Returns only the fields that should be filtered, not the entire data object.
 */
function filterManagedFeedData(
  data: Partial<FeedInsert>,
  aggregatorId?: string,
): {
  aggregatorOptions?: Record<string, any>;
  aiTranslateTo?: string;
  aiSummarize?: boolean;
  aiCustomPrompt?: string;
} {
  if (!aggregatorId) {
    return {};
  }

  try {
    const aggregatorMetadata = getAggregatorMetadataById(aggregatorId);

    if (aggregatorMetadata.type === "managed") {
      const filtered: {
        aggregatorOptions?: Record<string, any>;
        aiTranslateTo?: string;
        aiSummarize?: boolean;
        aiCustomPrompt?: string;
      } = {};

      // Filter out restricted aggregator options
      if (data.aggregatorOptions) {
        const restrictedOptions = [
          "exclude_selectors",
          "ignore_content_contains",
          "ignore_title_contains",
          "regex_replacements",
        ];
        const filteredOptions: Record<string, any> = {};
        Object.entries(data.aggregatorOptions).forEach(([key, value]) => {
          if (!restrictedOptions.includes(key)) {
            filteredOptions[key] = value;
          }
        });
        filtered.aggregatorOptions = filteredOptions;
      } else {
        filtered.aggregatorOptions = {};
      }

      // Filter out AI features
      filtered.aiTranslateTo = "";
      filtered.aiSummarize = false;
      filtered.aiCustomPrompt = "";

      return filtered;
    }
  } catch (error) {
    // If we can't get aggregator metadata, continue without filtering
    logger.warn(
      { error, aggregator: aggregatorId },
      "Failed to get aggregator metadata for filtering",
    );
  }

  return {};
}

/**
 * Create a new feed.
 */
export async function createFeed(
  user: UserInfo,
  data: FeedInsert,
): Promise<Feed> {
  // Filter out restricted options and AI features for managed aggregators
  const filteredFields = filterManagedFeedData(data, data.aggregator);

  // For managed aggregators, always use the aggregator's icon
  let icon = data.icon;
  if (data.aggregator) {
    const { getAggregatorMetadataById } = await import("./aggregator.service");
    try {
      const aggregatorMetadata = getAggregatorMetadataById(data.aggregator);
      // If aggregator is managed, always use its icon
      if (aggregatorMetadata.type === "managed" && aggregatorMetadata.icon) {
        icon = aggregatorMetadata.icon;
      } else if (!icon && aggregatorMetadata.icon) {
        // For non-managed aggregators, use icon if not provided
        icon = aggregatorMetadata.icon;
      }
    } catch (error) {
      // If we can't get aggregator metadata, continue without icon
      logger.warn(
        { error, aggregator: data.aggregator },
        "Failed to get aggregator icon",
      );
    }
  }

  const [feed] = await db
    .insert(feeds)
    .values({
      ...data,
      ...filteredFields,
      icon: icon || null,
      userId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logger.info({ feedId: feed.id, userId: user.id }, "Feed created");

  return feed;
}

/**
 * Update feed.
 */
export async function updateFeed(
  id: number,
  user: UserInfo,
  data: Partial<FeedInsert>,
): Promise<Feed> {
  // Check access
  const existingFeed = await getFeed(id, user);

  // Filter out restricted options and AI features for managed aggregators
  const aggregatorId = data.aggregator || existingFeed.aggregator;
  const filteredFields = filterManagedFeedData(data, aggregatorId);

  const [updated] = await db
    .update(feeds)
    .set({ ...data, ...filteredFields, updatedAt: new Date() })
    .where(eq(feeds.id, id))
    .returning();

  if (!updated) {
    throw new NotFoundError(`Feed with id ${id} not found`);
  }

  logger.info({ feedId: id, userId: user.id }, "Feed updated");

  return updated;
}

/**
 * Delete feed.
 */
export async function deleteFeed(id: number, user: UserInfo): Promise<void> {
  // Check access
  await getFeed(id, user);

  await db.delete(feeds).where(eq(feeds.id, id));

  logger.info({ feedId: id, userId: user.id }, "Feed deleted");
}

/**
 * Preview feed (test aggregation without saving).
 * Mimics backend/core/services/feed_service.py preview_feed method.
 * Fetches the first article with full content.
 */
export async function previewFeed(
  user: UserInfo,
  data: Partial<FeedInsert>,
): Promise<{
  success: boolean;
  articles: Array<{
    title: string;
    content: string;
    published?: string;
    author?: string;
    thumbnailUrl?: string;
    link: string;
  }>;
  count: number;
  error?: string;
  errorType?:
    | "validation"
    | "network"
    | "parse"
    | "authentication"
    | "timeout"
    | "unknown";
}> {
  const previewStart = Date.now();
  logger.info(
    {
      userId: user.id,
      aggregator: data.aggregator,
      identifier: data.identifier,
      step: "preview_start",
    },
    "Feed preview requested",
  );

  try {
    // Validate required fields
    logger.debug({ step: "validation_start" }, "Validating input");
    if (!data.aggregator) {
      logger.warn(
        { step: "validation_failed", reason: "missing_aggregator" },
        "Aggregator is required",
      );
      return {
        success: false,
        articles: [],
        count: 0,
        error: "Aggregator is required",
        errorType: "validation",
      };
    }

    if (!data.identifier) {
      logger.warn(
        { step: "validation_failed", reason: "missing_identifier" },
        "Identifier is required",
      );
      return {
        success: false,
        articles: [],
        count: 0,
        error: "Identifier is required",
        errorType: "validation",
      };
    }

    logger.debug({ step: "validation_complete" }, "Input validated");

    // Filter out restricted options and AI features for managed aggregators
    const filteredFields = filterManagedFeedData(data, data.aggregator);
    const filteredData = { ...data, ...filteredFields };

    // Get aggregator
    const getAggregatorStart = Date.now();
    logger.debug(
      { step: "get_aggregator_start" },
      "Getting aggregator instance",
    );
    const aggregator = getAggregatorById(filteredData.aggregator!);
    if (!aggregator) {
      logger.error(
        { aggregator: filteredData.aggregator, step: "get_aggregator_failed" },
        "Aggregator not found",
      );
      return {
        success: false,
        articles: [],
        count: 0,
        error: `Aggregator '${filteredData.aggregator}' not found`,
        errorType: "validation",
      };
    }
    logger.debug(
      {
        aggregator: filteredData.aggregator,
        elapsed: Date.now() - getAggregatorStart,
        step: "get_aggregator_complete",
      },
      "Aggregator instance obtained",
    );

    // Create temporary feed object for preview
    // Note: skipDuplicates is set to false for preview (like backend)
    const createFeedStart = Date.now();
    logger.debug(
      { step: "create_feed_start" },
      "Creating temporary feed object",
    );
    const tempFeed: Feed = {
      id: -1, // Temporary ID
      userId: user.id,
      name: filteredData.name || "Preview Feed",
      identifier: filteredData.identifier!,
      feedType: (filteredData.feedType as any) || "article",
      icon: filteredData.icon || null,
      example: filteredData.example || "",
      aggregator: filteredData.aggregator!,
      enabled: true,
      generateTitleImage: filteredData.generateTitleImage ?? true,
      addSourceFooter: filteredData.addSourceFooter ?? true,
      skipDuplicates: false, // Don't skip duplicates during preview (like backend)
      useCurrentTimestamp: filteredData.useCurrentTimestamp ?? true,
      dailyPostLimit: filteredData.dailyPostLimit ?? 50,
      aggregatorOptions:
        (filteredData.aggregatorOptions as Record<string, unknown>) || {},
      aiTranslateTo: filteredData.aiTranslateTo || "",
      aiSummarize: filteredData.aiSummarize ?? false,
      aiCustomPrompt: filteredData.aiCustomPrompt || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    logger.debug(
      {
        elapsed: Date.now() - createFeedStart,
        step: "create_feed_complete",
      },
      "Temporary feed object created",
    );

    // Initialize aggregator
    const initStart = Date.now();
    logger.debug({ step: "init_aggregator_start" }, "Initializing aggregator");
    aggregator.initialize(
      tempFeed,
      true, // Force refresh for preview
      (filteredData.aggregatorOptions as Record<string, unknown>) || {},
    );
    logger.debug(
      {
        elapsed: Date.now() - initStart,
        step: "init_aggregator_complete",
      },
      "Aggregator initialized",
    );

    // Run aggregation with extended timeout for preview
    // For preview, only process the first article
    const timeoutMs = 120000; // 2 minutes - allows for slow feeds and content fetching
    const articleLimit = 1; // Only process first article for preview
    logger.info(
      {
        timeout: timeoutMs,
        articleLimit,
        step: "aggregation_start",
      },
      `Starting aggregation with ${timeoutMs}ms timeout (limit: ${articleLimit} article)`,
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const elapsed = Date.now() - previewStart;
        logger.warn(
          {
            elapsed,
            timeout: timeoutMs,
            step: "timeout_triggered",
          },
          "Feed preview timeout triggered",
        );
        reject(new Error("Feed preview timed out after 2 minutes"));
      }, timeoutMs);
    });

    const aggregationStart = Date.now();
    const aggregationPromise = aggregator.aggregate(articleLimit);

    let rawArticles: RawArticle[];
    try {
      logger.debug(
        { step: "race_start" },
        "Starting Promise.race between aggregation and timeout",
      );
      rawArticles = await Promise.race([aggregationPromise, timeoutPromise]);
      const aggregationElapsed = Date.now() - aggregationStart;
      logger.info(
        {
          articleCount: rawArticles.length,
          elapsed: aggregationElapsed,
          step: "aggregation_complete",
        },
        `Aggregation completed: ${rawArticles.length} articles`,
      );
    } catch (timeoutError: any) {
      const aggregationElapsed = Date.now() - aggregationStart;
      if (timeoutError.message?.includes("timed out")) {
        logger.warn(
          {
            userId: user.id,
            feedName: data.name,
            elapsed: aggregationElapsed,
            totalElapsed: Date.now() - previewStart,
            step: "timeout_error",
          },
          "Feed preview timed out",
        );
        return {
          success: false,
          articles: [],
          count: 0,
          error:
            "Feed preview timed out after 2 minutes. The feed may be too slow or unavailable.",
          errorType: "timeout",
        };
      }
      throw timeoutError;
    }

    // Check if feed is empty
    logger.debug(
      { articleCount: rawArticles?.length || 0, step: "check_empty" },
      "Checking if feed is empty",
    );
    if (!rawArticles || rawArticles.length === 0) {
      logger.warn({ step: "empty_feed" }, "No articles found in feed");
      return {
        success: false,
        articles: [],
        count: 0,
        error:
          "No articles found in the feed. The feed may be empty or the URL may be incorrect.",
        errorType: "parse",
      };
    }

    // Process articles for preview (already limited to 1 by aggregator)
    const processStart = Date.now();
    logger.debug(
      {
        articleCount: rawArticles.length,
        step: "process_articles_start",
      },
      "Processing articles for preview",
    );

    const previewArticles: Array<{
      title: string;
      content: string;
      published?: string;
      author?: string;
      thumbnailUrl?: string;
      link: string;
    }> = [];

    // Process all articles returned (should be only 1 due to articleLimit)
    for (const article of rawArticles) {
      try {
        logger.debug(
          {
            title: article.title,
            url: article.url,
            step: "process_article",
          },
          "Processing article for preview",
        );

        // Collect thumbnail if missing and convert to base64 (same as normal aggregation)
        let thumbnailBase64 = article.thumbnailUrl
          ? await (
              await import("../aggregators/base/utils")
            ).convertThumbnailUrlToBase64(article.thumbnailUrl)
          : null;

        if (!thumbnailBase64) {
          const { extractThumbnailUrlFromPageAndConvertToBase64 } =
            await import("../aggregators/base/utils");
          thumbnailBase64 =
            (await extractThumbnailUrlFromPageAndConvertToBase64(
              article.url,
            )) || null;
          if (thumbnailBase64) {
            logger.debug(
              { url: article.url },
              "Extracted and converted thumbnail to base64 during preview",
            );
          }
        }

        previewArticles.push({
          title: article.title,
          content: article.content || article.summary || "",
          published: article.published
            ? article.published.toISOString()
            : undefined,
          author: article.author,
          thumbnailUrl: thumbnailBase64 || undefined,
          link: article.url,
        });
        logger.debug({ step: "process_article_complete" }, "Article processed");
      } catch (error) {
        logger.warn(
          {
            error,
            article,
            step: "process_article_error",
          },
          "Error processing article for preview",
        );
        continue;
      }
    }

    const processElapsed = Date.now() - processStart;
    logger.debug(
      {
        elapsed: processElapsed,
        step: "process_articles_complete",
      },
      "Articles processed",
    );

    if (previewArticles.length === 0) {
      logger.warn(
        { step: "no_processed_articles" },
        "Could not process any articles",
      );
      return {
        success: false,
        articles: [],
        count: 0,
        error:
          "Could not process any articles from the feed. The feed format may not be supported.",
        errorType: "parse",
      };
    }

    const totalElapsed = Date.now() - previewStart;
    logger.info(
      {
        userId: user.id,
        aggregator: data.aggregator,
        count: previewArticles.length,
        totalElapsed,
        step: "preview_complete",
      },
      `Feed preview completed successfully in ${totalElapsed}ms`,
    );

    return {
      success: true,
      articles: previewArticles,
      count: previewArticles.length,
    };
  } catch (error: any) {
    logger.error({ error, userId: user.id, data }, "Feed preview failed");

    // Determine error type (matching backend error detection)
    const errorMsg = String(error?.message || error || "").toLowerCase();
    let errorType:
      | "validation"
      | "network"
      | "parse"
      | "authentication"
      | "timeout"
      | "unknown" = "unknown";
    let errorMessage = "Unknown error occurred";

    if (
      errorMsg.includes("authentication") ||
      errorMsg.includes("unauthorized") ||
      errorMsg.includes("forbidden")
    ) {
      errorType = "authentication";
      errorMessage = `Authentication failed: ${error?.message || String(error)}`;
    } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out")) {
      errorType = "timeout";
      errorMessage = `Request timed out: ${error?.message || String(error)}`;
    } else if (
      errorMsg.includes("connection") ||
      errorMsg.includes("network")
    ) {
      errorType = "network";
      errorMessage = `Network error: ${error?.message || String(error)}`;
    } else if (
      errorMsg.includes("parse") ||
      errorMsg.includes("xml") ||
      errorMsg.includes("feed")
    ) {
      errorType = "parse";
      errorMessage = `Could not parse feed: ${error?.message || String(error)}`;
    } else {
      errorType = "unknown";
      errorMessage = `An error occurred: ${error?.message || String(error)}`;
    }

    return {
      success: false,
      articles: [],
      count: 0,
      error: errorMessage,
      errorType: errorType,
    };
  }
}

/**
 * Reload feed (trigger aggregation).
 */
export async function reloadFeed(
  id: number,
  user: UserInfo,
  force: boolean = false,
): Promise<{
  success: boolean;
  message: string;
  articlesAdded: number;
  articlesUpdated: number;
  articlesSkipped: number;
  errors: string[];
}> {
  // Check access
  const feed = await getFeed(id, user);

  try {
    const { processFeedAggregation } = await import("./aggregation.service");
    const result = await processFeedAggregation(id, force);

    const message = `Feed '${feed.name}' reloaded successfully`;
    logger.info(
      { feedId: id, userId: user.id, force, ...result },
      "Feed reload completed",
    );

    return {
      success: true,
      message,
      articlesAdded: result.articlesCreated,
      articlesUpdated: result.articlesUpdated,
      articlesSkipped: 0,
      errors: [],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error({ feedId: id, userId: user.id, error }, "Feed reload failed");

    return {
      success: false,
      message: `Error reloading feed: ${errorMessage}`,
      articlesAdded: 0,
      articlesUpdated: 0,
      articlesSkipped: 0,
      errors: [errorMessage],
    };
  }
}

/**
 * Clear all articles from a feed.
 */
export async function clearFeedArticles(
  id: number,
  user: UserInfo,
): Promise<void> {
  // Check access
  await getFeed(id, user);

  await db.delete(articles).where(eq(articles.feedId, id));

  logger.info({ feedId: id, userId: user.id }, "Feed articles cleared");
}
