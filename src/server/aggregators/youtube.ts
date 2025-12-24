/**
 * YouTube channel aggregator using YouTube Data API v3.
 *
 * This module provides an aggregator for YouTube channels using the official
 * YouTube Data API v3 instead of RSS feeds or web scraping.
 *
 * ## Overview
 *
 * The YouTube aggregator is an API-based aggregator that:
 * - Uses YouTube Data API v3 to fetch videos (no RSS feeds or web scraping)
 * - Resolves channel handles (@username) and channel IDs using API calls
 * - Fetches video metadata (thumbnails, descriptions, statistics, content details)
 * - Creates embedded video player content in articles
 *
 * ## Configuration
 *
 * **Required User Settings:**
 * - `youtubeEnabled`: Must be true
 * - `youtubeApiKey`: YouTube Data API v3 key
 *   - Get one at: https://console.cloud.google.com/apis/credentials
 *   - Enable "YouTube Data API v3" in your Google Cloud project
 *
 * ## Usage
 *
 * Supported identifier formats:
 * - `@mkbhd` or `mkbhd` (channel handle)
 * - `UCBJycsmduvYEL83R_U4JriQ` (channel ID, starts with UC)
 * - `https://www.youtube.com/@mkbhd` (full URL)
 * - `https://www.youtube.com/channel/UC...` (channel URL)
 *
 * ## Architecture
 *
 * Unlike RSS-based aggregators, this aggregator:
 * 1. Uses `channels.list` to resolve channel identifiers
 * 2. Uses `playlistItems.list` to get videos from channel's uploads playlist
 * 3. Uses `videos.list` to get detailed video information
 * 4. Converts API responses to RawArticle format
 *
 * ## API Quota Considerations
 *
 * YouTube Data API v3 has quota limits:
 * - Default quota: 10,000 units per day
 * - channels.list: 1 unit per request
 * - playlistItems.list: 1 unit per request
 * - videos.list: 1 unit per request
 * - commentThreads.list: 1 unit per request
 *
 * This aggregator makes:
 * - 1 request to resolve channel (if needed)
 * - 1 request to get uploads playlist ID
 * - 1+ requests to get playlist items (50 videos per request)
 * - 1 request per batch of videos for details
 * - 1 request per video for comments (if comment_limit > 0)
 *
 * For a feed with 50 videos and 10 comments per video: ~53-54 API units per aggregation run.
 */

import { getUserSettings } from "../services/userSettings.service";

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { resolveChannelId, validateYouTubeIdentifier } from "./youtube/channel";
import { YouTubeAPIError } from "./youtube/errors";
import { fetchYouTubeChannelData } from "./youtube/fetching";
import { parseYouTubeVideos } from "./youtube/parsing";
import type { YouTubeVideo } from "./youtube/videos";

// Re-export YouTubeAPIError for external use
export { YouTubeAPIError } from "./youtube/errors";

// Re-export resolveChannelId and types for external use
export { resolveChannelId, validateYouTubeIdentifier } from "./youtube/channel";
export type { YouTubeSearchItem } from "./youtube/channel";

// Interfaces are now in helper modules:
// - YouTubeVideo: ./youtube/videos
// - YouTubeComment: ./youtube/comments
// - YouTubeChannel: ./youtube/fetching

export class YouTubeAggregator extends BaseAggregator {
  override readonly id = "youtube";
  override readonly type = "social" as const;
  override readonly name = "YouTube Channel";
  override readonly url = "";
  override readonly description =
    "YouTube - Video sharing platform with channels covering various topics.";

  override readonly identifierType = "string" as const;
  override readonly identifierLabel = "Channel";
  override readonly identifierDescription =
    "Enter the YouTube channel handle (e.g., '@mkbhd'), channel ID (UC...), or channel URL.";
  override readonly identifierPlaceholder = "@mkbhd";
  override readonly identifierEditable = true;
  override readonly prefillName = false;

  // Store channel icon URL for feed icon collection
  private channelIconUrl: string | null = null;

  override readonly options = {
    comment_limit: {
      type: "integer" as const,
      label: "Comment Limit",
      helpText: "Number of top comments to fetch per video",
      default: 10,
      required: false,
      min: 0,
      max: 50,
    },
  };

  /**
   * Get YouTube API key from user settings.
   */
  private async getApiKey(): Promise<string> {
    if (!this.feed?.userId) {
      throw new YouTubeAPIError(
        "Feed must have a user ID to access YouTube API key",
      );
    }

    const settings = await getUserSettings(this.feed.userId);
    if (
      !settings.youtubeEnabled ||
      !settings.youtubeApiKey ||
      settings.youtubeApiKey.trim() === ""
    ) {
      throw new YouTubeAPIError(
        "YouTube API key is not configured in user settings",
      );
    }

    return settings.youtubeApiKey;
  }

  /**
   * Collect feed icon URL during aggregation.
   */
  override async collectFeedIcon(): Promise<string | null> {
    return this.channelIconUrl;
  }

  /**
   * Validate YouTube channel identifier.
   */
  async validateIdentifier(
    identifier: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const apiKey = await this.getApiKey();
      return await validateYouTubeIdentifier(identifier, apiKey);
    } catch (error) {
      return {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to validate identifier",
      };
    }
  }

  /**
   * Normalize a YouTube channel identifier to channel ID.
   *
   * Returns the channel ID (UC...) for consistent storage.
   */
  normalizeIdentifier(identifier: string): string {
    identifier = identifier.trim();
    if (identifier.startsWith("UC") && identifier.length >= 24) {
      return identifier;
    }

    // For now, return as-is - actual normalization happens during aggregation
    // This matches Python behavior where normalization happens in resolve_channel_id
    if (identifier.startsWith("@")) {
      return identifier;
    }
    if (identifier.includes("youtube.com") && identifier.includes("/@")) {
      const atPos = identifier.indexOf("/@");
      const endPos = identifier.indexOf("/", atPos + 2);
      if (endPos === -1) {
        const queryPos = identifier.indexOf("?", atPos + 2);
        if (queryPos === -1) {
          return identifier.slice(atPos + 1);
        }
        return identifier.slice(atPos + 1, queryPos);
      }
      return identifier.slice(atPos + 1, endPos);
    }
    return identifier;
  }

  /**
   * Validate YouTube channel identifier and resolve to channel ID.
   */
  protected override async validate(): Promise<void> {
    await super.validate();

    if (!this.feed) {
      throw new YouTubeAPIError("Feed not initialized");
    }

    const apiKey = await this.getApiKey();
    const identifier = this.feed.identifier;

    // Resolve to channel ID
    const { channelId, error } = await resolveChannelId(identifier, apiKey);
    if (error || !channelId) {
      this.logger.error(
        {
          step: "validate",
          subStep: "resolveChannelId",
          aggregator: this.id,
          feedId: this.feed?.id,
          identifier,
          error,
        },
        "Could not resolve YouTube identifier",
      );
      // Check if it's an API configuration issue vs invalid identifier
      const isApiError =
        error &&
        (error.includes("quota") ||
          error.includes("API key") ||
          error.includes("not enabled") ||
          error.includes("access denied") ||
          error.includes("restricted"));

      if (isApiError) {
        throw new YouTubeAPIError(error || "YouTube API configuration error");
      } else {
        throw new YouTubeAPIError(
          `Invalid YouTube identifier: ${error || "Unknown error"}`,
        );
      }
    }

    // Store channel ID for use in fetchSourceData
    // channelId is guaranteed to be non-null here due to the check above
    (this as { __channelId?: string }).__channelId = channelId;
  }

  /**
   * Fetch YouTube channel info and videos.
   */
  protected override async fetchSourceData(limit?: number): Promise<unknown> {
    if (!this.feed) {
      throw new YouTubeAPIError("Feed not initialized");
    }

    const apiKey = await this.getApiKey();
    const channelId = (this as { __channelId?: string }).__channelId;

    if (!channelId) {
      throw new YouTubeAPIError(
        "Channel ID not resolved. Call validate() first.",
      );
    }

    // Calculate desired article count
    const desiredArticleCount = limit || 25;

    // Fetch 2-3x more videos than needed to account for filtering
    // YouTube API max is 50 per request, but we can paginate
    const maxResults = Math.min(desiredArticleCount * 3, 200);

    // Apply rate limiting
    await this.applyRateLimiting();

    const { videos, channelIconUrl } = await fetchYouTubeChannelData(
      channelId,
      maxResults,
      apiKey,
      this.id,
      this.feed?.id,
    );

    // Store channel icon URL for feed icon collection
    this.channelIconUrl = channelIconUrl;

    return { videos, channelId };
  }

  /**
   * Parse YouTube videos to RawArticle[].
   */
  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    const { videos, channelId } = sourceData as {
      videos: YouTubeVideo[];
      channelId: string;
    };

    const commentLimit = this.getOption("comment_limit", 10) as number;
    const apiKey = await this.getApiKey();

    return parseYouTubeVideos(
      videos,
      channelId,
      commentLimit,
      apiKey,
      this.id,
      this.feed?.id,
      this.feed?.useCurrentTimestamp,
    );
  }

  /**
   * Process content with YouTube-specific formatting.
   *
   * Passes the video URL as headerImageUrl to ensure createHeaderElementFromUrl
   * creates the YouTube embed iframe at the top of the content.
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const { processContent: processContentUtil } =
      await import("./base/process");
    const { sanitizeHtml } = await import("./base/utils");

    // Sanitize HTML (remove scripts, rename attributes)
    const sanitized = sanitizeHtml(html);

    // Process content with video URL as headerImageUrl
    // This ensures createHeaderElementFromUrl creates the YouTube embed iframe
    const generateTitleImage = this.feed?.generateTitleImage ?? true;
    const addSourceFooter = this.feed?.addSourceFooter ?? true;
    return await processContentUtil(
      sanitized,
      article,
      generateTitleImage,
      addSourceFooter,
      article.url, // Pass video URL as headerImageUrl
    );
  }

  /**
   * Remove YouTube-specific elements (.ytd-app).
   */
  protected override async removeElementsBySelectors(
    html: string,
    _article: RawArticle,
  ): Promise<string> {
    const { removeElementsBySelectors } = await import("./base/utils");
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // Remove YouTube-specific elements
    $(".ytd-app").remove();

    // Use base selector removal
    return removeElementsBySelectors($.html(), this.selectorsToRemove);
  }

  /**
   * Extract YouTube thumbnail URL from a YouTube video URL.
   * Overrides base implementation with YouTube-specific logic.
   * @param url YouTube video URL
   * @returns Thumbnail URL or null if not a YouTube URL
   */
  override async extractThumbnailFromUrl(url: string): Promise<string | null> {
    const { extractYouTubeVideoId } = await import("./base/utils");
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      // Not a YouTube URL, fall back to base implementation
      return await super.extractThumbnailFromUrl(url);
    }

    // Try maxresdefault first (highest quality), fall back to hqdefault
    for (const quality of ["maxresdefault", "hqdefault"]) {
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
      try {
        const axios = (await import("axios")).default;
        const response = await axios.head(thumbnailUrl, { timeout: 5000 });
        if (response.status === 200) {
          return thumbnailUrl;
        }
      } catch {
        // Try next quality
        continue;
      }
    }

    // If HEAD requests failed (timeout, network issue), return hqdefault directly
    // instead of fetching the entire YouTube page HTML (which is huge and slow)
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
}
