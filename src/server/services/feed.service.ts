/**
 * Feed service.
 *
 * Handles feed management operations.
 * This file now re-exports from split services for backward compatibility.
 */

// Re-export query functions
export {
  listFeeds,
  getFeed,
  getFeedAggregatorMetadata,
  getFeedArticleCount,
  getFeedUnreadCount,
} from "./feed-query.service";

// Re-export CRUD functions
export {
  createFeed,
  updateFeed,
  deleteFeed,
  clearFeedArticles,
} from "./feed-crud.service";

// Import and re-export preview and reload functions (keeping them here for now)
import type { FeedInsert, User } from "../db/types";
import { logger } from "../utils/logger";

import { getFeed } from "./feed-query.service";
import { validateFeedPreviewInput, getValidatedAggregator } from "./feed-preview-validator";
import { buildPreviewFeed } from "./feed-preview-builder";
import { aggregateFeedWithRetry } from "./feed-aggregation-strategy";
import { processArticlesForPreview } from "./feed-article-preview-processor";
import { classifyFeedError } from "./feed-error-classifier";

/**
 * Minimal user info needed for feed operations.
 */
type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * Preview feed (test aggregation without saving).
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
    mediaUrl?: string;
    feedType?: "article" | "youtube" | "podcast" | "reddit";
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
    // 1. Validate input
    const validation = validateFeedPreviewInput(data);
    if (!validation.valid) {
      return {
        success: false,
        articles: [],
        count: 0,
        error: validation.error,
        errorType: "validation",
      };
    }

    // 2. Build temporary feed
    const aggregator = getValidatedAggregator(data.aggregator!);
    const tempFeed = buildPreviewFeed(user, data, aggregator);

    // 3. Initialize and aggregate articles
    aggregator.initialize(
      tempFeed,
      true,
      (data.aggregatorOptions as Record<string, unknown>) || {},
    );

    const rawArticles = await aggregateFeedWithRetry(aggregator, 120000);

    if (!rawArticles || rawArticles.length === 0) {
      return {
        success: false,
        articles: [],
        count: 0,
        error:
          "No articles found in the feed. The feed may be empty, all articles were filtered out, or the URL may be incorrect.",
        errorType: "parse",
      };
    }

    // 4. Process articles into preview format
    const previewArticles = await processArticlesForPreview(
      rawArticles,
      aggregator,
      tempFeed,
    );

    if (previewArticles.length === 0) {
      return {
        success: false,
        articles: [],
        count: 0,
        error:
          "Could not process any articles from the feed. The feed format may not be supported.",
        errorType: "parse",
      };
    }

    return {
      success: true,
      articles: previewArticles,
      count: previewArticles.length,
    };
  } catch (error: unknown) {
    logger.error({ error, userId: user.id, data }, "Feed preview failed");

    const { errorType, errorMessage } = classifyFeedError(error);

    return {
      success: false,
      articles: [],
      count: 0,
      error: errorMessage,
      errorType,
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
