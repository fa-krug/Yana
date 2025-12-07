/**
 * Base aggregator class.
 *
 * All aggregators must extend this class.
 */

import type { Feed, Article } from '../../db/types';
import type { RawArticle, AggregatorOptions, OptionsSchema } from './types';
import { logger } from '../../utils/logger';
import { createLogger } from '../../utils/logger';
import { db, articles } from '../../db';
import { eq, and, gte, desc } from 'drizzle-orm';

export abstract class BaseAggregator {
  protected feed: Feed | null = null;
  protected forceRefresh: boolean = false;
  protected runtimeOptions: AggregatorOptions = {};
  protected logger = logger;
  protected existingUrls: Set<string> | null = null;

  // Required metadata - must be implemented by subclasses
  abstract readonly id: string;
  abstract readonly type: 'managed' | 'custom' | 'social';
  abstract readonly name: string;
  abstract readonly url: string;
  abstract readonly description: string;

  // Optional metadata
  readonly identifierType: 'url' | 'string' = 'url';
  readonly identifierLabel: string = 'Feed URL';
  readonly identifierDescription: string = 'Enter the RSS feed URL';
  readonly identifierPlaceholder: string = '';
  readonly identifierChoices?: Array<[string, string]>;
  readonly identifierEditable: boolean = false;

  // Optional configuration
  readonly options?: OptionsSchema;
  readonly selectorsToRemove: string[] = [];
  readonly waitForSelector?: string;
  readonly fetchTimeout: number = 30000;

  /**
   * Initialize aggregator with feed and options.
   */
  initialize(feed: Feed, forceRefresh: boolean = false, options: AggregatorOptions = {}): void {
    this.feed = feed;
    this.forceRefresh = forceRefresh;
    this.runtimeOptions = { ...this.getDefaultOptions(), ...options };
    this.logger = createLogger({ aggregator: this.id, feedId: feed.id });
  }

  /**
   * Get default options.
   */
  protected getDefaultOptions(): AggregatorOptions {
    if (!this.options) return {};

    const defaults: AggregatorOptions = {};
    for (const [key, def] of Object.entries(this.options)) {
      if (def.default !== undefined) {
        defaults[key] = def.default;
      }
    }
    return defaults;
  }

  /**
   * Get option value.
   */
  protected getOption<T>(key: string, defaultValue: T): T {
    return (this.runtimeOptions[key] as T) ?? defaultValue;
  }

  /**
   * Main aggregation method.
   * Must be implemented by subclasses.
   * @param articleLimit - Maximum number of articles to process (undefined = no limit)
   */
  abstract aggregate(articleLimit?: number): Promise<RawArticle[]>;

  /**
   * Process article content.
   * Can be overridden by subclasses.
   */
  protected async processArticle(article: RawArticle): Promise<string> {
    // Default: return content as-is
    return article.content || article.summary || '';
  }

  /**
   * Should skip this article?
   * Can be overridden by subclasses.
   */
  protected shouldSkipArticle(article: RawArticle): boolean {
    // Default: don't skip
    return false;
  }

  /**
   * Set existing article URLs to skip fetching content for them when forceRefresh is false.
   */
  setExistingUrls(urls: Set<string>): void {
    this.existingUrls = urls;
  }

  /**
   * Check if article URL already exists (to skip fetching content).
   */
  protected isExistingUrl(url: string): boolean {
    if (this.forceRefresh || !this.existingUrls) {
      return false;
    }
    return this.existingUrls.has(url);
  }

  // ============================================================================
  // Daily Limit Distribution Logic
  // ============================================================================

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
  async getDynamicFetchLimit(forceRefresh: boolean = false): Promise<number> {
    const limit = this._getDailyPostLimit();

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
      const sourceName = this._getSourceName();
      this.logger.info(
        {
          sourceName,
          postsToday,
          limit,
        },
        `Daily quota exhausted for ${sourceName}: ${postsToday}/${limit}`
      );
      return 0; // Quota exhausted
    }

    const remainingRuns = await this.calculateRemainingRunsToday();
    const dynamicLimit = Math.max(1, Math.ceil(remainingQuota / remainingRuns));

    const sourceName = this._getSourceName();
    this.logger.info(
      {
        sourceName,
        dynamicLimit,
        postsToday,
        limit,
        remainingRuns,
      },
      `Dynamic limit for ${sourceName}: ${dynamicLimit} posts (${postsToday}/${limit} today, ~${remainingRuns} runs left)`
    );

    return dynamicLimit;
  }

  /**
   * Count posts added today (since UTC midnight) for this feed.
   *
   * @returns Number of posts added today
   */
  protected async getPostsAddedToday(): Promise<number> {
    if (!this.feed) {
      return 0;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await db
      .select()
      .from(articles)
      .where(and(eq(articles.feedId, this.feed.id), gte(articles.createdAt, todayStart)));

    return result.length;
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
  protected async calculateRemainingRunsToday(): Promise<number> {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    midnight.setUTCHours(0, 0, 0, 0);

    const secondsUntilMidnight = (midnight.getTime() - now.getTime()) / 1000;

    // Get most recent post added today
    const recentPostTime = await this._getMostRecentPostTimeToday();

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
   * Get the daily post limit from the feed.
   *
   * @returns Daily post limit (-1=unlimited, 0=disabled, n>0=target)
   */
  protected _getDailyPostLimit(): number {
    if (this.feed && this.feed.dailyPostLimit !== undefined) {
      return this.feed.dailyPostLimit;
    }
    // Default to 50
    return 50;
  }

  /**
   * Get a human-readable name for the feed for logging.
   *
   * @returns Source name for logging
   */
  protected _getSourceName(): string {
    if (this.feed) {
      return this.feed.name || 'Unknown Feed';
    }
    return 'Unknown';
  }

  /**
   * Get the creation time of the most recent post added today.
   *
   * @returns Datetime of most recent post, or null
   */
  protected async _getMostRecentPostTimeToday(): Promise<Date | null> {
    if (!this.feed) {
      return null;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await db
      .select({ createdAt: articles.createdAt })
      .from(articles)
      .where(and(eq(articles.feedId, this.feed.id), gte(articles.createdAt, todayStart)))
      .orderBy(desc(articles.createdAt))
      .limit(1);

    return result.length > 0 ? result[0].createdAt : null;
  }
}
