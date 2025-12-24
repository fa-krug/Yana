/**
 * Daily limit distribution mixin for BaseAggregator.
 */

import { eq, and, gte, desc } from "drizzle-orm";
import type pino from "pino";

import { db, articles } from "@server/db";
import type { Feed } from "@server/db/types";

/**
 * Interface for aggregator with daily limit functionality.
 */
export interface DailyLimitMixin {
  readonly feed: Feed | null;
  readonly defaultDailyLimit: number;
  readonly logger: pino.Logger;
  readonly id: string;
  getMostRecentPostTimeToday(): Promise<Date | null>;
  getDailyPostLimit(): number;
  getPostsAddedToday(): Promise<number>;
  getSourceName(): string;
  calculateRemainingRunsToday(): Promise<number>;
}

/**
 * Get the daily post limit from the feed.
 *
 * @returns Daily post limit (-1=unlimited, 0=disabled, n>0=target)
 */
export function getDailyPostLimit(this: DailyLimitMixin): number {
  if (this.feed && this.feed.dailyPostLimit !== undefined) {
    return this.feed.dailyPostLimit;
  }
  // Use aggregator's default
  return this.defaultDailyLimit;
}

/**
 * Get a human-readable name for the feed for logging.
 *
 * @returns Source name for logging
 */
export function getSourceName(this: DailyLimitMixin): string {
  if (this.feed) {
    return this.feed.name || "Unknown Feed";
  }
  return "Unknown";
}

/**
 * Count posts added today (since UTC midnight) for this feed.
 *
 * @returns Number of posts added today
 */
export async function getPostsAddedToday(
  this: DailyLimitMixin,
): Promise<number> {
  if (!this.feed) {
    return 0;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const result = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.feedId, this.feed.id),
        gte(articles.createdAt, todayStart),
      ),
    );

  return result.length;
}

/**
 * Get the creation time of the most recent post added today.
 *
 * @returns Datetime of most recent post, or null
 */
export async function getMostRecentPostTimeToday(
  this: DailyLimitMixin,
): Promise<Date | null> {
  if (!this.feed) {
    return null;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const result = await db
    .select({ createdAt: articles.createdAt })
    .from(articles)
    .where(
      and(
        eq(articles.feedId, this.feed.id),
        gte(articles.createdAt, todayStart),
      ),
    )
    .orderBy(desc(articles.createdAt))
    .limit(1);

  return result.length > 0 ? result[0].createdAt : null;
}

/**
 * Calculate remaining aggregation runs until UTC midnight based on time since last run.
 *
 * This estimates how many more times aggregation will run today by:
 * 1. Looking at the most recent post added today
 * 2. Calculating time since that post was added (= time since last run)
 * 3. Estimating remaining runs: seconds_until_midnight / seconds_since_last_run
 *
 * @returns Estimated number of remaining runs (at least 1 to avoid division by zero)
 */
export async function calculateRemainingRunsToday(
  this: DailyLimitMixin,
): Promise<number> {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);

  const secondsUntilMidnight = (midnight.getTime() - now.getTime()) / 1000;

  // Get most recent post added today
  const recentPostTime = await this.getMostRecentPostTimeToday();

  let secondsSinceLastRun: number;

  if (recentPostTime) {
    // Calculate time since last post was added
    secondsSinceLastRun = (now.getTime() - recentPostTime.getTime()) / 1000;
  } else {
    // No posts today yet, estimate based on time since midnight
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const secondsSinceMidnight = (now.getTime() - todayStart.getTime()) / 1000;

    if (secondsSinceMidnight > 0) {
      secondsSinceLastRun = secondsSinceMidnight;
    } else {
      // Edge case: very start of day
      secondsSinceLastRun = 1800; // Assume 30 min default
    }
  }

  // Avoid division by zero
  if (secondsSinceLastRun <= 0) {
    secondsSinceLastRun = 1800; // Default to 30 minutes
  }

  // Estimate remaining runs
  const estimatedRuns = secondsUntilMidnight / secondsSinceLastRun;
  return Math.max(1, Math.ceil(estimatedRuns));
}

/**
 * Calculate dynamic fetch limit based on daily post limit and distribution.
 *
 * This method distributes posts evenly throughout the day across multiple
 * aggregation runs. Instead of fetching all posts at once, it calculates how
 * many posts to fetch per run based on:
 * - Total daily limit
 * - Posts already fetched today
 * - Estimated remaining runs until midnight
 *
 * @param forceRefresh - If true, fetch up to full daily limit regardless of today's count
 * @returns Number of posts to fetch (0 if quota exhausted or disabled)
 */
export async function getDynamicFetchLimit(
  this: DailyLimitMixin,
  forceRefresh: boolean = false,
): Promise<number> {
  const limit = this.getDailyPostLimit();

  // Unlimited
  if (limit === -1) {
    return 100; // Safety maximum per run
  }

  // Disabled
  if (limit === 0) {
    return 0;
  }

  // Force refresh: fetch up to full daily limit
  if (forceRefresh) {
    return limit;
  }

  // Calculate distribution
  const postsToday = await this.getPostsAddedToday();
  const remainingQuota = limit - postsToday;

  if (remainingQuota <= 0) {
    const sourceName = this.getSourceName();
    this.logger.info(
      {
        sourceName,
        postsToday,
        limit,
      },
      `Daily quota exhausted for ${sourceName}: ${postsToday}/${limit}`,
    );
    return 0; // Quota exhausted
  }

  const remainingRuns = await this.calculateRemainingRunsToday();
  const dynamicLimit = Math.max(1, Math.ceil(remainingQuota / remainingRuns));

  const sourceName = this.getSourceName();
  this.logger.info(
    {
      sourceName,
      dynamicLimit,
      postsToday,
      limit,
      remainingRuns,
    },
    `Dynamic limit for ${sourceName}: ${dynamicLimit} posts (${postsToday}/${limit} today, ~${remainingRuns} runs left)`,
  );

  return dynamicLimit;
}
