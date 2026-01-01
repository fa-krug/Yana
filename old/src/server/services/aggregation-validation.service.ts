/**
 * Aggregation validation service - handles validation and preparation for aggregation.
 */

import { eq } from "drizzle-orm";

import type { BaseAggregator } from "@server/aggregators/base/aggregator";
import { getAggregatorById } from "@server/aggregators/registry";
import { db, feeds, articles } from "@server/db";
import type { Feed } from "@server/db/types";
import { NotFoundError } from "@server/errors";
import { logger } from "@server/utils/logger";

/**
 * Validate feed and prepare aggregator for processing.
 */
export async function validateAndPrepareAggregation(
  feedId: number,
): Promise<{ feed: Feed; aggregator: BaseAggregator }> {
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

  return { feed, aggregator };
}

/**
 * Load existing article URLs for a feed.
 */
export async function loadExistingUrls(
  feedId: number,
): Promise<Set<string> | null> {
  const existingArticles = await db
    .select({ url: articles.url })
    .from(articles)
    .where(eq(articles.feedId, feedId));
  const existingUrls = new Set(existingArticles.map((a) => a.url));
  logger.debug(
    { feedId, existingCount: existingUrls.size },
    "Loaded existing article URLs to skip content fetching",
  );
  return existingUrls;
}

/**
 * Initialize aggregator with feed configuration.
 */
export function initializeAggregator(
  aggregator: BaseAggregator,
  feed: Feed,
  forceRefresh: boolean,
  existingUrls: Set<string> | null,
): void {
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
}

/**
 * Calculate dynamic article limit if aggregator supports it.
 */
export async function calculateArticleLimit(
  aggregator: BaseAggregator,
  feedId: number,
  forceRefresh: boolean,
): Promise<number | undefined> {
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
  return articleLimit;
}
