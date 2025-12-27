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
import type { RawArticle } from "../aggregators/base/types";
import { getAggregatorById } from "../aggregators/registry";
import type { Feed, FeedInsert, User } from "../db/types";
import { logger } from "../utils/logger";

import { getFeed } from "./feed-query.service";

/**
 * Minimal user info needed for feed operations.
 */
type UserInfo = Pick<User, "id" | "isSuperuser">;

/**
 * Preview feed (test aggregation without saving).
 * TODO: Extract to feed-preview.service.ts when time permits.
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
  // Implementation moved to feed-preview.service.ts in future refactoring
  // For now, keeping original implementation here
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
    if (!data.aggregator || !data.identifier) {
      return {
        success: false,
        articles: [],
        count: 0,
        error: data.aggregator
          ? "Identifier is required"
          : "Aggregator is required",
        errorType: "validation",
      };
    }

    const aggregator = getAggregatorById(data.aggregator);
    if (!aggregator) {
      return {
        success: false,
        articles: [],
        count: 0,
        error: `Aggregator '${data.aggregator}' not found`,
        errorType: "validation",
      };
    }

    const tempFeed: Feed = {
      id: -1,
      userId: user.id,
      name: data.name || "Preview Feed",
      identifier: data.identifier,
      feedType:
        (data.feedType as "article" | "youtube" | "podcast" | "reddit") ||
        "article",
      icon: data.icon || null,
      example: data.example || "",
      aggregator: data.aggregator,
      enabled: true,
      generateTitleImage: data.generateTitleImage ?? true,
      addSourceFooter: data.addSourceFooter ?? true,
      skipDuplicates: false,
      useCurrentTimestamp: data.useCurrentTimestamp ?? true,
      dailyPostLimit: data.dailyPostLimit ?? aggregator.defaultDailyLimit ?? 50,
      aggregatorOptions:
        (data.aggregatorOptions as Record<string, unknown>) || {},
      aiTranslateTo: data.aiTranslateTo || "",
      aiSummarize: data.aiSummarize ?? false,
      aiCustomPrompt: data.aiCustomPrompt || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    aggregator.initialize(
      tempFeed,
      true,
      (data.aggregatorOptions as Record<string, unknown>) || {},
    );

    const timeoutMs = 120000;
    const articleLimits = [1, 5, 10, 25, 50];
    let rawArticles: RawArticle[] = [];

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Feed preview timed out after 2 minutes"));
      }, timeoutMs);
    });

    for (const articleLimit of articleLimits) {
      try {
        const attemptArticles = await Promise.race([
          aggregator.aggregate(articleLimit),
          timeoutPromise,
        ]);

        if (attemptArticles && attemptArticles.length > 0) {
          rawArticles = attemptArticles.slice(0, 1);
          break;
        }
      } catch (error: unknown) {
        if (String(error).includes("timed out")) {
          return {
            success: false,
            articles: [],
            count: 0,
            error:
              "Feed preview timed out after 2 minutes. The feed may be too slow or unavailable.",
            errorType: "timeout",
          };
        }
      }
    }

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

    const previewArticles: Array<{
      title: string;
      content: string;
      published?: string;
      author?: string;
      thumbnailUrl?: string;
      link: string;
      mediaUrl?: string;
      feedType?: "article" | "youtube" | "podcast" | "reddit";
    }> = [];

    for (const article of rawArticles) {
      try {
        let thumbnailBase64 = article.thumbnailUrl
          ? await (
              await import("../aggregators/base/utils")
            ).convertThumbnailUrlToBase64(article.thumbnailUrl)
          : null;

        if (!thumbnailBase64) {
          const thumbnailUrl = await aggregator.extractThumbnailFromUrl(
            article.url,
          );
          if (thumbnailUrl) {
            const { convertThumbnailUrlToBase64 } =
              await import("../aggregators/base/utils");
            thumbnailBase64 = await convertThumbnailUrlToBase64(thumbnailUrl);
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
          mediaUrl: article.mediaUrl,
          feedType: tempFeed.feedType,
        });
      } catch (error) {
        logger.warn({ error, article }, "Error processing article for preview");
        continue;
      }
    }

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

    const errorMsg = String(
      error instanceof Error ? error.message : error || "",
    ).toLowerCase();
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
      errorMessage = `Authentication failed: ${error instanceof Error ? error.message : String(error)}`;
    } else if (errorMsg.includes("timeout") || errorMsg.includes("timed out")) {
      errorType = "timeout";
      errorMessage = `Request timed out: ${error instanceof Error ? error.message : String(error)}`;
    } else if (
      errorMsg.includes("connection") ||
      errorMsg.includes("network")
    ) {
      errorType = "network";
      errorMessage = `Network error: ${error instanceof Error ? error.message : String(error)}`;
    } else if (
      errorMsg.includes("parse") ||
      errorMsg.includes("xml") ||
      errorMsg.includes("feed")
    ) {
      errorType = "parse";
      errorMessage = `Could not parse feed: ${error instanceof Error ? error.message : String(error)}`;
    } else {
      errorType = "unknown";
      errorMessage = `An error occurred: ${error instanceof Error ? error.message : String(error)}`;
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
