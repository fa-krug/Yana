/**
 * Base aggregator class.
 *
 * All aggregators must extend this class.
 */

import type { Feed } from "@server/db/types";
import { logger, createLogger } from "@server/utils/logger";

import type { RawArticle, AggregatorOptions, OptionsSchema } from "./types";

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
    const validation = await import("./mixins/validation");
    return validation.validate.call(this as any);
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
    const rateLimiting = await import("./mixins/rateLimiting");
    return rateLimiting.applyRateLimiting.call(this as any);
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
    const utilities = await import("./mixins/utilities");
    return utilities.extractMetadata.call(
      this as any,
      sourceData,
      article,
    );
  }

  /**
   * Filter articles (skip logic, filters, limits).
   * Override for custom filtering.
   */
  protected async filterArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const filtering = await import("./mixins/filtering");
    return filtering.filterArticles.call(this as any, articles);
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
    const filtering = await import("./mixins/filtering");
    return filtering.applyArticleFilters.call(this as any, articles);
  }

  /**
   * Apply article limit.
   * Enforces daily post limit by checking how many posts have been added today
   * and limiting articles to fit within the remaining quota.
   * Override for custom limit logic.
   */
  protected async applyArticleLimit(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    if (!this.feed) {
      return articles;
    }

    const limit = await this._getDailyPostLimit();

    // Unlimited or disabled - no limit
    if (limit === -1 || limit === 0) {
      return articles;
    }

    // Get posts added today
    const postsToday = await this.getPostsAddedToday();
    const remainingQuota = limit - postsToday;

    // No quota remaining
    if (remainingQuota <= 0) {
      const sourceName = await this._getSourceName();
      this.logger.info(
        {
          sourceName,
          postsToday,
          limit,
          articlesCount: articles.length,
        },
        `Daily quota exhausted for ${sourceName}: ${postsToday}/${limit}, skipping ${articles.length} articles`,
      );
      return []; // Return empty array - quota exhausted
    }

    // Limit articles to remaining quota
    if (articles.length > remainingQuota) {
      const sourceName = await this._getSourceName();
      this.logger.info(
        {
          sourceName,
          postsToday,
          limit,
          remainingQuota,
          articlesCount: articles.length,
          limitedTo: remainingQuota,
        },
        `Limiting articles for ${sourceName}: ${articles.length} -> ${remainingQuota} (${postsToday}/${limit} today)`,
      );
      return articles.slice(0, remainingQuota);
    }

    return articles;
  }

  /**
   * Enrich articles (fetch content, extract, process).
   * Override for custom enrichment logic.
   */
  protected async enrichArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const enrichment = await import("./mixins/enrichment");
    return enrichment.enrichArticles.call(this as any, articles);
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
    const caching = await import("./mixins/caching");
    return caching.getCachedContent.call(this as any, article);
  }

  /**
   * Set cached content for article.
   * Override for custom caching strategy.
   */
  protected async setCachedContent(
    article: RawArticle,
    content: string,
  ): Promise<void> {
    const caching = await import("./mixins/caching");
    return caching.setCachedContent.call(
      this as any,
      article,
      content,
    );
  }

  /**
   * Fetch article content from URL.
   * Override for custom fetching logic.
   */
  protected async fetchArticleContentInternal(
    url: string,
    _article: RawArticle,
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
    const contentProcessing = await import("./mixins/contentProcessing");
    return contentProcessing.extractContent.call(
      this as any,
      html,
      article,
    );
  }

  /**
   * Remove elements by CSS selectors.
   * Override for custom selector removal.
   */
  protected async removeElementsBySelectors(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const contentProcessing = await import("./mixins/contentProcessing");
    return contentProcessing.removeElementsBySelectors.call(
      this as any,
      html,
      article,
    );
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
    const contentProcessing = await import("./mixins/contentProcessing");
    return contentProcessing.processContent.call(
      this as any,
      html,
      article,
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
    const contentProcessing = await import("./mixins/contentProcessing");
    return contentProcessing.extractImages.call(
      this as any,
      content,
      article,
    );
  }

  /**
   * Finalize articles (deduplication, sorting, validation).
   * Override for custom finalization.
   */
  protected async finalizeArticles(
    articles: RawArticle[],
  ): Promise<RawArticle[]> {
    const contentProcessing = await import("./mixins/contentProcessing");
    return contentProcessing.finalizeArticles.call(
      this as any,
      articles,
    );
  }

  /**
   * Process article content.
   * Can be overridden by subclasses.
   */
  protected async processArticle(article: RawArticle): Promise<string> {
    const contentProcessing = await import("./mixins/contentProcessing");
    return contentProcessing.processArticle.call(
      this as any,
      article,
    );
  }

  /**
   * Extract thumbnail URL from an article URL.
   * Can be overridden by subclasses for aggregator-specific logic.
   * @param url The article URL
   * @returns Thumbnail URL or null if not found
   */
  async extractThumbnailFromUrl(url: string): Promise<string | null> {
    const utilities = await import("./mixins/utilities");
    return utilities.extractThumbnailFromUrl.call(this as any, url);
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
    const utilities = await import("./mixins/utilities");
    return utilities.collectFeedIcon.call(this as any);
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
    const dailyLimit = await import("./mixins/dailyLimit");
    return dailyLimit.getDynamicFetchLimit.call(
      this as any,
      forceRefresh,
    );
  }

  /**
   * Count posts added today (since UTC midnight) for this feed.
   *
   * @returns Number of posts added today
   */
  protected async getPostsAddedToday(): Promise<number> {
    const dailyLimit = await import("./mixins/dailyLimit");
    return dailyLimit.getPostsAddedToday.call(this as any);
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
    const dailyLimit = await import("./mixins/dailyLimit");
    return dailyLimit.calculateRemainingRunsToday.call(this as any);
  }

  /**
   * Get the daily post limit from the feed.
   *
   * @returns Daily post limit (-1=unlimited, 0=disabled, n>0=target)
   */
  protected async _getDailyPostLimit(): Promise<number> {
    const dailyLimit = await import("./mixins/dailyLimit");
    return dailyLimit.getDailyPostLimit.call(this as any);
  }

  /**
   * Get a human-readable name for the feed for logging.
   *
   * @returns Source name for logging
   */
  protected async _getSourceName(): Promise<string> {
    const dailyLimit = await import("./mixins/dailyLimit");
    return dailyLimit.getSourceName.call(this as any);
  }

  /**
   * Get the creation time of the most recent post added today.
   *
   * @returns Datetime of most recent post, or null
   */
  protected async _getMostRecentPostTimeToday(): Promise<Date | null> {
    const dailyLimit = await import("./mixins/dailyLimit");
    return dailyLimit.getMostRecentPostTimeToday.call(this as any);
  }
}
