/**
 * Reddit aggregator.
 *
 * Aggregates posts from Reddit subreddits using Reddit's OAuth2 API.
 * Based on the legacy Python implementation using PRAW.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { logger } from "../utils/logger";
import axios from "axios";
import { getUserSettings } from "../services/userSettings.service";
import { standardizeContentFormat } from "./base/process";
import { getRedditAccessToken } from "./reddit/auth";
import {
  normalizeSubreddit,
  validateSubreddit,
  extractPostInfoFromUrl,
  fetchSubredditInfo,
} from "./reddit/urls";
import { extractHeaderImageUrl, extractThumbnailUrl } from "./reddit/images";
import { buildPostContent } from "./reddit/content";
import { fetchRedditPost } from "./reddit/posts";
import { parseRedditPosts, type RedditPost } from "./reddit/parsing";

// Re-export RedditPost type from parsing module
export type { RedditPost } from "./reddit/parsing";

export class RedditAggregator extends BaseAggregator {
  override readonly id = "reddit";
  override readonly type = "social" as const;
  override readonly name = "Reddit";
  override readonly url = "https://www.reddit.com/r/example";
  override readonly description =
    "Reddit - Social news aggregation and discussion website organized into communities (subreddits).";

  override readonly identifierType = "string" as const;
  override readonly identifierLabel = "Subreddit";
  override readonly identifierDescription =
    "Enter the subreddit name (e.g., 'python', 'programming'). You can also use 'r/python' or a full Reddit URL.";
  override readonly identifierPlaceholder = "python";
  override readonly identifierEditable = true;
  override readonly prefillName = false;
  override readonly defaultDailyLimit = 20;

  // Store subreddit icon URL for feed icon collection
  private subredditIconUrl: string | null = null;

  override readonly options = {
    sort_by: {
      type: "choice" as const,
      label: "Sort Method",
      helpText: "How to sort posts: hot (default), new, top, or rising",
      default: "hot",
      required: false,
      choices: [
        ["hot", "Hot"],
        ["new", "New"],
        ["top", "Top"],
        ["rising", "Rising"],
      ] as Array<[string, string]>,
    },
    comment_limit: {
      type: "integer" as const,
      label: "Comment Limit",
      helpText: "Number of top comments to fetch per post",
      default: 10,
      required: false,
      min: 0,
      max: 50,
    },
  };

  /**
   * Validate subreddit identifier.
   */
  async validateIdentifier(
    identifier: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const subreddit = normalizeSubreddit(identifier);
    return validateSubreddit(subreddit);
  }

  /**
   * Normalize subreddit identifier.
   */
  normalizeIdentifier(identifier: string): string {
    return normalizeSubreddit(identifier);
  }

  /**
   * Get Reddit user agent from user settings or use default.
   * Also validates that Reddit is enabled and credentials are configured.
   */
  private async getUserAgent(): Promise<string> {
    if (!this.feed?.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const userId = this.feed.userId;

    try {
      const settings = await getUserSettings(userId);

      // Validate Reddit is enabled
      if (!settings.redditEnabled) {
        throw new Error(
          "Reddit is not enabled. Please enable Reddit in your settings and configure API credentials.",
        );
      }

      // Validate credentials are present
      if (!settings.redditClientId || !settings.redditClientSecret) {
        throw new Error(
          "Reddit API credentials not configured. Please set Client ID and Client Secret in your settings.",
        );
      }

      return settings.redditUserAgent || "Yana/1.0";
    } catch (error) {
      if (error instanceof Error && error.message.includes("Reddit")) {
        throw error; // Re-throw Reddit-specific errors
      }
      logger.warn(
        { error },
        "Could not get user settings, using default user agent",
      );
      throw new Error("Could not get user settings for Reddit API access.");
    }
  }

  /**
   * Collect feed icon URL during aggregation.
   */
  override async collectFeedIcon(): Promise<string | null> {
    return this.subredditIconUrl;
  }

  /**
   * Validate subreddit identifier.
   */
  protected override async validate(): Promise<void> {
    await super.validate();

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const subreddit = normalizeSubreddit(this.feed.identifier);
    if (!subreddit) {
      throw new Error(
        `Could not extract subreddit from identifier: ${this.feed.identifier}`,
      );
    }

    const validation = validateSubreddit(subreddit);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid subreddit");
    }
  }

  /**
   * Apply rate limiting for Reddit API.
   */
  protected override async applyRateLimiting(): Promise<void> {
    // Reddit API is generally permissive, but we still apply default rate limiting
    await super.applyRateLimiting();
  }

  /**
   * Fetch Reddit posts from API.
   */
  protected override async fetchSourceData(limit?: number): Promise<unknown> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "fetchSourceData",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        limit,
      },
      "Fetching Reddit posts",
    );

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const subreddit = normalizeSubreddit(this.feed.identifier);
    if (!subreddit) {
      throw new Error(
        `Could not extract subreddit from identifier: ${this.feed.identifier}`,
      );
    }

    const sortBy = this.getOption("sort_by", "hot") as string;

    if (!this.feed.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const userId = this.feed.userId;

    // Validate Reddit is enabled and get user agent (validates credentials)
    await this.getUserAgent();

    // Fetch subreddit info to get icon for feed thumbnail
    const subredditInfo = await fetchSubredditInfo(subreddit, userId);

    // Store subreddit icon URL for feed icon collection
    this.subredditIconUrl = subredditInfo.iconUrl;
    // Legacy support: also store in private property for backwards compatibility
    (this as any).__subredditIconUrl = subredditInfo.iconUrl;

    // Calculate desired article count
    const desiredArticleCount = limit || 25;

    // Fetch 2-3x more posts than needed to account for filtering
    // (AutoModerator posts, old posts, etc.)
    // Reddit API max is 100
    const fetchLimit = Math.min(desiredArticleCount * 3, 100);

    // Apply rate limiting
    await this.applyRateLimiting();

    try {
      // Get access token for authenticated API call
      const accessToken = await getRedditAccessToken(userId);

      // Fetch posts from Reddit OAuth API
      const url = `https://oauth.reddit.com/r/${subreddit}/${sortBy}`;
      const response = await axios.get(url, {
        params: {
          limit: fetchLimit,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 30000,
      });

      const posts: RedditPost[] = response.data.data.children || [];

      const elapsed = Date.now() - startTime;
      this.logger.info(
        {
          step: "fetchSourceData",
          subStep: "complete",
          aggregator: this.id,
          feedId: this.feed?.id,
          postCount: posts.length,
          elapsed,
        },
        "Reddit posts fetched",
      );

      return { posts, subreddit, subredditInfo };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        {
          step: "fetchSourceData",
          subStep: "error",
          aggregator: this.id,
          feedId: this.feed?.id,
          error: error instanceof Error ? error : new Error(String(error)),
          elapsed,
        },
        "Error fetching Reddit posts",
      );
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(
            `Subreddit 'r/${subreddit}' does not exist or is private.`,
          );
        }
        if (error.response?.status === 403) {
          throw new Error(`Subreddit 'r/${subreddit}' is private or banned.`);
        }
      }
      throw error;
    }
  }

  /**
   * Parse Reddit posts to RawArticle[].
   */
  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    const { posts, subreddit } = sourceData as {
      posts: RedditPost[];
      subreddit: string;
      subredditInfo: { iconUrl: string | null };
    };

    const commentLimit = this.getOption("comment_limit", 10) as number;

    if (!this.feed?.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const userId = this.feed.userId;

    return parseRedditPosts(
      posts,
      subreddit,
      commentLimit,
      userId,
      this.id,
      this.feed?.id,
    );
  }

  /**
   * Check if article should be skipped (AutoModerator, old posts).
   */
  protected override shouldSkipArticle(article: RawArticle): boolean {
    // Check base skip logic first
    if (super.shouldSkipArticle(article)) {
      return true;
    }

    // Skip AutoModerator posts
    if (article.author === "AutoModerator") {
      this.logger.debug(
        {
          step: "filterArticles",
          subStep: "shouldSkipArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          reason: "AutoModerator",
        },
        "Skipping AutoModerator post",
      );
      return true;
    }

    // Skip if too old (older than 2 months)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    if (article.published < twoMonthsAgo) {
      this.logger.debug(
        {
          step: "filterArticles",
          subStep: "shouldSkipArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          reason: "too_old",
          date: article.published,
        },
        "Skipping old post",
      );
      return true;
    }

    return false;
  }

  /**
   * Fetch article content from URL.
   * Override to fetch Reddit posts via API (including comments) instead of web scraping.
   * Always uses API - never falls back to web scraping.
   */
  protected override async fetchArticleContentInternal(
    url: string,
    article: RawArticle,
  ): Promise<string> {
    const { subreddit, postId } = extractPostInfoFromUrl(url);

    if (!subreddit || !postId) {
      throw new Error(
        `Invalid Reddit URL format: ${url}. Expected format: /r/{subreddit}/comments/{postId}/...`,
      );
    }

    if (!this.feed?.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const postData = await fetchRedditPost(subreddit, postId, this.feed.userId);

    if (!postData) {
      throw new Error(
        `Failed to fetch Reddit post ${postId} from r/${subreddit} via API`,
      );
    }

    // Build content with comments
    const content = await buildPostContent(
      postData,
      this.getOption("comment_limit", 10) as number,
      subreddit,
      this.feed.userId,
    );

    // Extract header image URL and store it in the article for processContent
    // This will be used by processContent to add the header image
    const headerImageUrl = extractHeaderImageUrl(postData);
    if (headerImageUrl) {
      (article as RawArticle & { headerImageUrl?: string }).headerImageUrl =
        headerImageUrl;
    }

    return content;
  }

  /**
   * Extract content from HTML.
   * Override to skip extraction for Reddit posts.
   * Content is always fetched via API (buildPostContent) and returns HTML fragments.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    // Reddit content is always formatted HTML fragments from buildPostContent (API)
    // No extraction needed - return as-is
    return html;
  }

  /**
   * Process content with Reddit-specific formatting.
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Processing Reddit content",
    );

    // Get header image URL if stored
    const headerImageUrl = (article as RawArticle & { headerImageUrl?: string })
      .headerImageUrl;

    const generateTitleImage = this.feed?.generateTitleImage ?? true;
    const addSourceFooter = this.feed?.addSourceFooter ?? true;

    // Use standardizeContentFormat with Reddit-specific header image
    const processed = await standardizeContentFormat(
      html,
      article,
      article.url,
      generateTitleImage,
      addSourceFooter,
      headerImageUrl,
    );

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Reddit content processed",
    );

    return processed;
  }
}
