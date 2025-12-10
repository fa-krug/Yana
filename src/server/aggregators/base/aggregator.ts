/**
 * Base aggregator class.
 *
 * All aggregators must extend this class.
 */

import type { Feed, Article } from "../../db/types";
import type { RawArticle, AggregatorOptions, OptionsSchema } from "./types";
import { logger } from "../../utils/logger";
import { createLogger } from "../../utils/logger";
import { db, articles } from "../../db";
import { eq, and, gte, desc } from "drizzle-orm";

export abstract class BaseAggregator {
  protected feed: Feed | null = null;
  protected forceRefresh: boolean = false;
  protected runtimeOptions: AggregatorOptions = {};
  protected logger = logger;
  protected existingUrls: Set<string> | null = null;

  // Required metadata - must be implemented by subclasses
  abstract readonly id: string;
  abstract readonly type: "managed" | "custom" | "social";
  abstract readonly name: string;
  abstract readonly url: string;
  abstract readonly description: string;

  // Optional metadata
  readonly identifierType: "url" | "string" = "url";
  readonly identifierLabel: string = "Feed URL";
  readonly identifierDescription: string = "Enter the RSS feed URL";
  readonly identifierPlaceholder: string = "";
  readonly identifierChoices?: Array<[string, string]>;
  readonly identifierEditable: boolean = false;
  readonly prefillName: boolean = true;

  // Optional configuration
  readonly options?: OptionsSchema;
  readonly selectorsToRemove: string[] = [];
  readonly waitForSelector?: string;
  readonly fetchTimeout: number = 30000;
  readonly defaultDailyLimit: number = 50;

  // Cache and rate limiting configuration
  readonly rateLimitDelay: number = 1000; // milliseconds
  readonly cacheTTL: number = 3600; // seconds (1 hour)
  readonly cacheMaxSize: number = 1000; // entries

  /**
   * Initialize aggregator with feed and options.
   */
  initialize(
    feed: Feed,
    forceRefresh: boolean = false,
    options: AggregatorOptions = {},
  ): void {
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
   * Main aggregation method - Template Method Pattern.
   * Orchestrates the fixed aggregation flow.
   * @param articleLimit - Maximum number of articles to process (undefined = no limit)
   */
  async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    const aggregateStart = Date.now();
    this.logger.info(
      {
        step: "aggregate",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleLimit,
      },
      "Starting aggregation",
    );

    try {
      // Step 1: Validate (already initialized by service)
      await this.validate();

      // Step 2: Fetch source data
      const sourceData = await this.fetchSourceData(articleLimit);

      // Step 3: Parse to raw articles
      let articles = await this.parseToRawArticles(sourceData);

      // Step 4: Filter articles
      articles = await this.filterArticles(articles);

      // Step 5: Enrich articles
      articles = await this.enrichArticles(articles);

      // Step 6: Collect feed icon (optional, done in service)
      // Step 7: Finalize articles
      articles = await this.finalizeArticles(articles);

      const totalElapsed = Date.now() - aggregateStart;
      this.logger.info(
        {
          step: "aggregate",
          subStep: "complete",
          aggregator: this.id,
          feedId: this.feed?.id,
          articleCount: articles.length,
          totalElapsed,
        },
        "Aggregation complete",
      );

      return articles;
    } catch (error) {
      const totalElapsed = Date.now() - aggregateStart;
      this.logger.error(
        {
          step: "aggregate",
          subStep: "error",
          aggregator: this.id,
          feedId: this.feed?.id,
          error: error instanceof Error ? error : new Error(String(error)),
          totalElapsed,
        },
        "Aggregation failed",
      );
      throw error;
    }
  }

  // ============================================================================
  // Template Method Steps - Override as needed
  // ============================================================================

  /**
   * Validate feed identifier/configuration.
   * Override for custom validation.
   */
  protected async validate(): Promise<void> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "validate",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
      },
      "Validating feed",
    );

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "validate",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        elapsed,
      },
      "Validation complete",
    );
  }

  /**
   * Fetch source data (RSS/API/etc).
   * Must be implemented by subclasses.
   */
  protected abstract fetchSourceData(limit?: number): Promise<unknown>;

  /**
   * Apply rate limiting before fetching.
   * Override for custom rate limiting logic.
   */
  protected async applyRateLimiting(): Promise<void> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "fetchSourceData",
        subStep: "applyRateLimiting",
        aggregator: this.id,
        feedId: this.feed?.id,
        delay: this.rateLimitDelay,
      },
      "Applying rate limiting",
    );

    await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay));

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "fetchSourceData",
        subStep: "applyRateLimiting",
        aggregator: this.id,
        feedId: this.feed?.id,
        elapsed,
      },
      "Rate limiting complete",
    );
  }

  /**
   * Parse source data to RawArticle[].
   * Must be implemented by subclasses.
   */
  protected abstract parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]>;

  /**
   * Extract metadata from source data.
   * Override for custom metadata extraction.
   */
  protected async extractMetadata(
    sourceData: unknown,
    article: RawArticle,
  ): Promise<Partial<RawArticle>> {
    // Default: no metadata extraction
    return {};
  }

  /**
   * Filter articles (skip logic, filters, limits).
   * Override for custom filtering.
   */
  protected async filterArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "filterArticles",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        initialCount: articles.length,
      },
      "Filtering articles",
    );

    let filtered = articles;

    // Apply skip logic
    filtered = filtered.filter((article) => {
      const shouldSkip = this.shouldSkipArticle(article);
      if (shouldSkip) {
        this.logger.debug(
          {
            step: "filterArticles",
            subStep: "shouldSkipArticle",
            aggregator: this.id,
            feedId: this.feed?.id,
            url: article.url,
            title: article.title,
          },
          "Article skipped",
        );
      }
      return !shouldSkip;
    });

    // Apply article filters
    filtered = await this.applyArticleFilters(filtered);

    // Apply article limit
    filtered = this.applyArticleLimit(filtered);

    const elapsed = Date.now() - startTime;
    this.logger.info(
      {
        step: "filterArticles",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        initialCount: articles.length,
        filteredCount: filtered.length,
        elapsed,
      },
      "Article filtering complete",
    );

    return filtered;
  }

  /**
   * Check if article should be skipped.
   * Override for custom skip logic.
   */
  protected shouldSkipArticle(article: RawArticle): boolean {
    // Default: check if URL already exists
    return this.isExistingUrl(article.url);
  }

  /**
   * Apply article filters (title/content filters).
   * Override for custom filtering.
   */
  protected async applyArticleFilters(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    // Default: no filtering
    return articles;
  }

  /**
   * Apply article limit.
   * Override for custom limit logic.
   */
  protected applyArticleLimit(articles: RawArticle[]): RawArticle[] {
    // Default: no limit
    return articles;
  }

  /**
   * Enrich articles (fetch content, extract, process).
   * Override for custom enrichment logic.
   */
  protected async enrichArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    const totalArticles = articles.length;
    this.logger.info(
      {
        step: "enrichArticles",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleCount: totalArticles,
      },
      "Enriching articles",
    );

    const enriched: RawArticle[] = [];

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const articleStart = Date.now();

      try {
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "processArticle",
            aggregator: this.id,
            feedId: this.feed?.id,
            progress: `${i + 1}/${totalArticles}`,
            url: article.url,
            title: article.title,
          },
          `Processing article ${i + 1}/${totalArticles}`,
        );

        // Check if content should be fetched
        if (!this.shouldFetchContent(article)) {
          this.logger.debug(
            {
              step: "enrichArticles",
              subStep: "shouldFetchContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              skip: true,
            },
            "Skipping content fetch",
          );
          enriched.push(article);
          continue;
        }

        // Try to get cached content
        let html: string | null = await this.getCachedContent(article);
        let fromCache = false;

        if (html) {
          fromCache = true;
          this.logger.debug(
            {
              step: "enrichArticles",
              subStep: "getCachedContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              cached: true,
            },
            "Using cached content",
          );
        } else {
          // Fetch article content
          try {
            html = await this.fetchArticleContentInternal(article.url, article);
            this.logger.debug(
              {
                step: "enrichArticles",
                subStep: "fetchArticleContent",
                aggregator: this.id,
                feedId: this.feed?.id,
                url: article.url,
                cached: false,
              },
              "Fetched article content",
            );
          } catch (error) {
            this.logger.warn(
              {
                step: "enrichArticles",
                subStep: "fetchArticleContent",
                aggregator: this.id,
                feedId: this.feed?.id,
                url: article.url,
                error:
                  error instanceof Error ? error : new Error(String(error)),
                fallback: "summary",
              },
              "Failed to fetch content, using summary",
            );
            // Fallback to summary
            article.content = article.summary || "";
            enriched.push(article);
            continue;
          }
        }

        // Extract content
        let extracted: string;
        try {
          extracted = await this.extractContent(html, article);
        } catch (error) {
          this.logger.warn(
            {
              step: "enrichArticles",
              subStep: "extractContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              error: error instanceof Error ? error : new Error(String(error)),
              fallback: "original",
            },
            "Failed to extract content, using original HTML",
          );
          extracted = html;
        }

        // Validate content
        const isValid = this.validateContent(extracted, article);
        if (!isValid) {
          this.logger.warn(
            {
              step: "enrichArticles",
              subStep: "validateContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              valid: false,
              skipped: true,
            },
            "Content validation failed, skipping article",
          );
          continue;
        }

        // Process content
        let processed: string;
        try {
          processed = await this.processContent(extracted, article);
        } catch (error) {
          this.logger.warn(
            {
              step: "enrichArticles",
              subStep: "processContent",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              error: error instanceof Error ? error : new Error(String(error)),
              fallback: "extracted",
            },
            "Failed to process content, using extracted content",
          );
          processed = extracted;
        }

        // Extract images (optional)
        try {
          await this.extractImages(processed, article);
        } catch (error) {
          this.logger.debug(
            {
              step: "enrichArticles",
              subStep: "extractImages",
              aggregator: this.id,
              feedId: this.feed?.id,
              url: article.url,
              error: error instanceof Error ? error : new Error(String(error)),
            },
            "Image extraction failed (non-critical)",
          );
        }

        article.content = processed;

        // Cache processed content
        if (!fromCache) {
          await this.setCachedContent(article, processed);
        }

        const articleElapsed = Date.now() - articleStart;
        this.logger.debug(
          {
            step: "enrichArticles",
            subStep: "processArticle",
            aggregator: this.id,
            feedId: this.feed?.id,
            progress: `${i + 1}/${totalArticles}`,
            url: article.url,
            elapsed: articleElapsed,
          },
          `Article ${i + 1} processed`,
        );

        enriched.push(article);
      } catch (error) {
        this.logger.error(
          {
            step: "enrichArticles",
            subStep: "processArticle",
            aggregator: this.id,
            feedId: this.feed?.id,
            progress: `${i + 1}/${totalArticles}`,
            url: article.url,
            error: error instanceof Error ? error : new Error(String(error)),
          },
          "Error processing article",
        );
        // Continue with next article
        continue;
      }
    }

    const elapsed = Date.now() - startTime;
    this.logger.info(
      {
        step: "enrichArticles",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        initialCount: totalArticles,
        enrichedCount: enriched.length,
        elapsed,
      },
      "Article enrichment complete",
    );

    return enriched;
  }

  /**
   * Check if content should be fetched.
   * Override for custom logic.
   */
  protected shouldFetchContent(article: RawArticle): boolean {
    // Default: fetch if not existing URL or force refresh
    return !this.isExistingUrl(article.url);
  }

  /**
   * Get cached content for article.
   * Override for custom caching strategy.
   */
  protected async getCachedContent(
    article: RawArticle,
  ): Promise<string | null> {
    if (this.forceRefresh) {
      return null;
    }

    const { getCache, generateCacheKey } = await import("./cache");
    const cache = getCache(this.id, this.cacheMaxSize, this.cacheTTL);
    const key = generateCacheKey(this.id, article.url);
    return cache.get(key);
  }

  /**
   * Set cached content for article.
   * Override for custom caching strategy.
   */
  protected async setCachedContent(
    article: RawArticle,
    content: string,
  ): Promise<void> {
    const { getCache, generateCacheKey } = await import("./cache");
    const cache = getCache(this.id, this.cacheMaxSize, this.cacheTTL);
    const key = generateCacheKey(this.id, article.url);
    cache.set(key, content);
  }

  /**
   * Fetch article content from URL.
   * Override for custom fetching logic.
   */
  protected async fetchArticleContentInternal(
    url: string,
    article: RawArticle,
  ): Promise<string> {
    // Default: use the generic fetch function (no retries)
    const { fetchArticleContent: fetchContent } = await import("./fetch");
    return fetchContent(url, {
      timeout: this.fetchTimeout,
      waitForSelector: this.waitForSelector,
    });
  }

  /**
   * Extract content from HTML.
   * Override for custom extraction.
   */
  protected async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const { extractContent } = await import("./extract");
    let extracted = extractContent(html, {
      selectorsToRemove: this.selectorsToRemove,
    });

    // Remove elements by selectors
    extracted = await this.removeElementsBySelectors(extracted, article);

    return extracted;
  }

  /**
   * Remove elements by CSS selectors.
   * Override for custom selector removal.
   */
  protected async removeElementsBySelectors(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const { removeElementsBySelectors } = await import("./utils");
    return removeElementsBySelectors(html, this.selectorsToRemove);
  }

  /**
   * Validate content quality.
   * Returns false to skip article.
   * Override for custom validation.
   */
  protected validateContent(content: string, article: RawArticle): boolean {
    // Default validation: check if content is not empty and has minimum length
    if (!content || content.trim().length === 0) {
      this.logger.debug(
        {
          step: "enrichArticles",
          subStep: "validateContent",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          reason: "empty_content",
        },
        "Content validation failed: empty content",
      );
      return false;
    }

    return true;
  }

  /**
   * Process content (sanitize, transform, standardize).
   * Override for custom processing.
   */
  protected async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    // Default: use standardizeContentFormat
    const { processContent: processContentUtil } = await import("./process");
    const { sanitizeHtml } = await import("./utils");

    // Sanitize HTML (remove scripts, rename attributes)
    const sanitized = sanitizeHtml(html);

    // Process content (standardize format with images and source link)
    const generateTitleImage = this.feed?.generateTitleImage ?? true;
    const addSourceFooter = this.feed?.addSourceFooter ?? true;
    return await processContentUtil(
      sanitized,
      article,
      generateTitleImage,
      addSourceFooter,
    );
  }

  /**
   * Extract and process images.
   * Override for custom image extraction.
   */
  protected async extractImages(
    content: string,
    article: RawArticle,
  ): Promise<void> {
    // Default: no image extraction
    // Images are handled in processContent via standardizeContentFormat
  }

  /**
   * Finalize articles (deduplication, sorting, validation).
   * Override for custom finalization.
   */
  protected async finalizeArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "finalizeArticles",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleCount: articles.length,
      },
      "Finalizing articles",
    );

    // Default: sort by published date (newest first)
    const finalized = articles.sort((a, b) => {
      return b.published.getTime() - a.published.getTime();
    });

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "finalizeArticles",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleCount: finalized.length,
        elapsed,
      },
      "Article finalization complete",
    );

    return finalized;
  }

  /**
   * Process article content.
   * Can be overridden by subclasses.
   */
  protected async processArticle(article: RawArticle): Promise<string> {
    // Default: return content as-is
    return article.content || article.summary || "";
  }

  /**
   * Extract thumbnail URL from an article URL.
   * Can be overridden by subclasses for aggregator-specific logic.
   * @param url The article URL
   * @returns Thumbnail URL or null if not found
   */
  async extractThumbnailFromUrl(url: string): Promise<string | null> {
    // Default implementation uses generic extraction
    const { extractThumbnailUrlFromPage } = await import("./utils");
    return await extractThumbnailUrlFromPage(url);
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

  /**
   * Collect feed icon URL during aggregation.
   * Can be overridden by subclasses to provide feed-specific icons.
   * The icon URL will be converted to base64 by the aggregation service.
   *
   * @returns Icon URL or null if no icon available
   */
  async collectFeedIcon(): Promise<string | null> {
    // Default: no feed icon collection
    return null;
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
        `Daily quota exhausted for ${sourceName}: ${postsToday}/${limit}`,
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
      `Dynamic limit for ${sourceName}: ${dynamicLimit} posts (${postsToday}/${limit} today, ~${remainingRuns} runs left)`,
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
      .where(
        and(
          eq(articles.feedId, this.feed.id),
          gte(articles.createdAt, todayStart),
        ),
      );

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
      const secondsSinceMidnight =
        (now.getTime() - todayStart.getTime()) / 1000;

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
    // Use aggregator's default
    return this.defaultDailyLimit;
  }

  /**
   * Get a human-readable name for the feed for logging.
   *
   * @returns Source name for logging
   */
  protected _getSourceName(): string {
    if (this.feed) {
      return this.feed.name || "Unknown Feed";
    }
    return "Unknown";
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
}
