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

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { logger } from "../utils/logger";
import axios, { AxiosError } from "axios";
import { getUserSettings } from "../services/userSettings.service";

/**
 * Custom error class for YouTube API errors.
 */
export class YouTubeAPIError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "YouTubeAPIError";
    this.cause = cause;
  }
}

/**
 * Extract a user-friendly error message from a YouTube API error.
 */
function getYouTubeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data as any;

    // Check for specific error reasons in the response
    if (errorData?.error?.errors?.[0]?.reason) {
      const reason = errorData.error.errors[0].reason;
      if (reason === "quotaExceeded") {
        return "YouTube API quota exceeded. Please try again later or check your quota in Google Cloud Console.";
      }
      if (reason === "accessNotConfigured") {
        return "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.";
      }
      if (reason === "forbidden") {
        return "API key is restricted or invalid. Check API key restrictions in Google Cloud Console.";
      }
    }

    // Handle specific status codes
    if (status === 403) {
      return "YouTube API access denied. This may be due to quota limits, API key restrictions, or the API not being enabled. Check your Google Cloud Console settings.";
    }
    if (status === 400) {
      return "Invalid YouTube API request. Check your API key and request parameters.";
    }
    if (status === 401) {
      return "Invalid YouTube API key. Check your API key in user settings.";
    }
    if (status === 404) {
      return "YouTube API endpoint not found. This may indicate an API configuration issue.";
    }

    // Fallback to status text or message
    return (
      errorData?.error?.message ||
      axiosError.message ||
      "Unknown YouTube API error"
    );
  }

  // Non-Axios errors
  return error instanceof Error ? error.message : String(error);
}

interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
      standard?: { url: string };
      maxres?: { url: string };
    };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

interface YouTubeChannel {
  id: string;
  contentDetails: {
    relatedPlaylists: {
      uploads?: string;
    };
  };
}

interface YouTubePlaylistItem {
  contentDetails: {
    videoId: string;
  };
  snippet: {
    publishedAt: string;
  };
}

interface YouTubeSearchItem {
  id: {
    channelId: string;
  };
  snippet: {
    title: string;
    customUrl?: string;
  };
}

interface YouTubeComment {
  id: string;
  snippet: {
    topLevelComment: {
      snippet: {
        textDisplay: string;
        textOriginal: string;
        authorDisplayName: string;
        authorProfileImageUrl?: string;
        likeCount: number;
        publishedAt: string;
        updatedAt: string;
      };
    };
    totalReplyCount: number;
    canReply: boolean;
  };
}

interface YouTubeCommentsResponse {
  items: YouTubeComment[];
  nextPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

/**
 * Resolve YouTube channel identifier to channel ID.
 *
 * This function handles various YouTube channel identifier formats and uses
 * the YouTube Data API v3 to resolve them to a canonical channel ID (UC...).
 *
 * **Supported formats:**
 * - Channel handle: `@mkbhd`, `mkbhd` (with or without @)
 * - Channel ID: `UCBJycsmduvYEL83R_U4JriQ` (starts with UC, 24+ chars)
 * - Full URL: `https://www.youtube.com/@mkbhd` or `https://www.youtube.com/channel/UC...`
 *
 * **Resolution process:**
 * 1. If identifier is already a channel ID (starts with UC), validates it via API
 * 2. If identifier is a URL, extracts handle or channel ID from path
 * 3. If identifier is a handle, uses `search.list` API call
 * 4. Falls back to `channels.list(forUsername=...)` if direct handle lookup fails
 */
export async function resolveChannelId(
  identifier: string,
  apiKey: string,
): Promise<{ channelId: string | null; error: string | null }> {
  if (!apiKey || apiKey.trim() === "") {
    return {
      channelId: null,
      error: "YouTube API key is not configured in user settings",
    };
  }

  identifier = identifier.trim();

  if (!identifier) {
    return { channelId: null, error: "Channel identifier is required" };
  }

  // If it starts with UC and is 24+ chars, assume it's already a channel ID
  if (identifier.startsWith("UC") && identifier.length >= 24) {
    // Validate it exists via API
    try {
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            part: "id",
            id: identifier,
            key: apiKey,
          },
        },
      );

      if (response.data.items && response.data.items.length > 0) {
        return { channelId: identifier, error: null };
      }
      return { channelId: null, error: `Channel ID not found: ${identifier}` };
    } catch (error) {
      logger.error(
        { error, identifier },
        "YouTube API error resolving channel ID",
      );
      const errorMessage = getYouTubeErrorMessage(error);
      return {
        channelId: null,
        error: errorMessage,
      };
    }
  }

  // Extract handle from URL if it's a URL
  let handle: string | null = null;
  if (
    identifier.startsWith("http://") ||
    identifier.startsWith("https://") ||
    identifier.startsWith("youtube.com") ||
    identifier.startsWith("www.youtube.com")
  ) {
    try {
      if (!identifier.startsWith("http")) {
        identifier = `https://${identifier}`;
      }

      const url = new URL(identifier);
      const path = url.pathname.trim().replace(/^\//, "");

      // Remove query parameters and fragments from path
      const cleanPath = path.split("?")[0].split("#")[0];

      // Handle @username format (modern handles)
      if (cleanPath.startsWith("@")) {
        handle = cleanPath.slice(1).split("/")[0]; // Remove @ and get first part
      }
      // Handle /c/customname format
      else if (cleanPath.startsWith("c/") || cleanPath.startsWith("user/")) {
        handle = cleanPath.split("/")[1].split("?")[0].split("#")[0];
      }
      // Handle /channel/UC... format
      else if (cleanPath.startsWith("channel/")) {
        const channelId = cleanPath.split("/")[1].split("?")[0].split("#")[0];
        if (channelId.startsWith("UC")) {
          return resolveChannelId(channelId, apiKey);
        }
      }
      // Check query parameters for channel_id
      else if (url.searchParams.has("channel_id")) {
        const channelId = url.searchParams.get("channel_id");
        if (channelId && channelId.startsWith("UC")) {
          return resolveChannelId(channelId, apiKey);
        }
      }
    } catch (error) {
      logger.error({ error, identifier }, "Error parsing URL");
      return {
        channelId: null,
        error: `Invalid URL format: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } else if (identifier.startsWith("@")) {
    handle = identifier.slice(1); // Remove @
  } else {
    // Assume it's a handle without @
    handle = identifier;
  }

  // Resolve handle to channel ID using API
  if (handle) {
    try {
      // For modern @handles, forUsername doesn't work. Use search.list instead.
      // Try searching with the handle (with @ prefix for better matching)
      const searchQuery = handle.startsWith("@") ? handle : `@${handle}`;

      // First, try searching for the exact handle
      const searchResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            part: "snippet",
            q: searchQuery,
            type: "channel",
            maxResults: 10, // Get more results to find the best match
            key: apiKey,
          },
        },
      );

      const searchItems: YouTubeSearchItem[] = searchResponse.data.items || [];
      if (searchItems.length > 0) {
        // Normalize handle for comparison (remove @, lowercase)
        const normalizedHandle = handle.toLowerCase().replace(/^@/, "");

        // Look for exact match by customUrl
        for (const item of searchItems) {
          const customUrl = item.snippet?.customUrl;
          if (customUrl) {
            // customUrl can be "@handle" or "handle" or "youtube.com/@handle"
            const customUrlNormalized = customUrl
              .toLowerCase()
              .replace(/^@/, "")
              .replace(/^youtube\.com\//, "")
              .replace(/^\//, "");
            if (customUrlNormalized === normalizedHandle) {
              const channelId = item.id.channelId;
              logger.info(
                { handle, channelId },
                "Resolved handle to channel ID via search (exact match by customUrl)",
              );
              return { channelId, error: null };
            }
          }
        }

        // Also check channel title for exact match (some channels don't have customUrl)
        for (const item of searchItems) {
          const title = (item.snippet?.title || "").toLowerCase();
          // Sometimes the handle is in the title
          if (
            normalizedHandle.includes(title) ||
            title.includes(normalizedHandle)
          ) {
            const channelId = item.id.channelId;
            logger.info(
              { handle, channelId },
              "Resolved handle to channel ID via search (exact match by title)",
            );
            return { channelId, error: null };
          }
        }

        // If no exact match, use the first result (most relevant)
        const channelId = searchItems[0].id.channelId;
        logger.info(
          { handle, channelId },
          "Resolved handle to channel ID via search (best match - first result)",
        );
        return { channelId, error: null };
      }

      // Fallback: Try forUsername for old-style usernames (deprecated but still works for some)
      // This is a last resort as it doesn't work for modern @handles
      try {
        const response = await axios.get(
          "https://www.googleapis.com/youtube/v3/channels",
          {
            params: {
              part: "id",
              forUsername: handle,
              key: apiKey,
            },
          },
        );
        const items = response.data.items || [];
        if (items.length > 0) {
          const channelId = items[0].id;
          logger.info(
            { handle, channelId },
            "Resolved handle to channel ID via forUsername",
          );
          return { channelId, error: null };
        }
      } catch (httpError) {
        // forUsername failed, which is expected for modern handles
        // Continue to return error below
      }

      return { channelId: null, error: `Channel handle not found: @${handle}` };
    } catch (error) {
      logger.error({ error, handle }, "Error resolving handle");
      const errorMessage = getYouTubeErrorMessage(error);
      return {
        channelId: null,
        error: errorMessage,
      };
    }
  }

  return { channelId: null, error: "Could not parse channel identifier" };
}

/**
 * Validate YouTube channel identifier.
 */
async function validateYouTubeIdentifier(
  identifier: string,
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const { channelId, error } = await resolveChannelId(identifier, apiKey);
  if (error) {
    return { valid: false, error };
  }
  return { valid: true };
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Fetch comments for a YouTube video.
 */
async function fetchVideoComments(
  videoId: string,
  commentLimit: number,
  apiKey: string,
): Promise<YouTubeComment[]> {
  if (commentLimit <= 0) {
    return [];
  }

  try {
    const comments: YouTubeComment[] = [];
    let nextPageToken: string | undefined;

    while (comments.length < commentLimit) {
      const response = await axios.get<YouTubeCommentsResponse>(
        "https://www.googleapis.com/youtube/v3/commentThreads",
        {
          params: {
            part: "snippet",
            videoId,
            maxResults: Math.min(100, commentLimit - comments.length),
            order: "relevance", // Sort by relevance (most liked/engaging first)
            textFormat: "html", // Get HTML formatted text
            pageToken: nextPageToken,
            key: apiKey,
          },
          timeout: 10000,
        },
      );

      const items = response.data.items || [];
      if (items.length === 0) {
        break;
      }

      // Filter out comments with no text or deleted comments
      const validComments = items.filter(
        (comment) =>
          comment.snippet.topLevelComment.snippet.textDisplay &&
          comment.snippet.topLevelComment.snippet.textDisplay !== "[deleted]" &&
          comment.snippet.topLevelComment.snippet.textDisplay !== "[removed]",
      );

      comments.push(...validComments);
      nextPageToken = response.data.nextPageToken;
      if (!nextPageToken) {
        break;
      }
    }

    return comments.slice(0, commentLimit);
  } catch (error) {
    logger.warn({ error, videoId }, "Error fetching YouTube comments");
    // Don't throw - return empty array so video aggregation can continue
    return [];
  }
}

/**
 * Build video content with comments.
 */
async function buildVideoContent(
  description: string,
  videoId: string,
  videoUrl: string,
  commentLimit: number,
  apiKey: string,
): Promise<string> {
  const contentParts: string[] = [];

  // Video description
  if (description) {
    // Convert newlines to paragraphs for better formatting
    const paragraphs = description.split("\n\n");
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        // Convert single newlines to <br>
        const withBreaks = trimmed.replace(/\n/g, "<br>");
        contentParts.push(`<p>${withBreaks}</p>`);
      }
    }
  }

  // Comments section
  contentParts.push(
    `<h3><a href="${videoUrl}" target="_blank" rel="noopener">Comments</a></h3>`,
  );

  // Fetch and format comments
  if (commentLimit > 0) {
    const comments = await fetchVideoComments(videoId, commentLimit, apiKey);
    if (comments.length > 0) {
      // Format comments with videoId for proper comment links
      const commentHtmls = comments.map((comment) => {
        const author =
          comment.snippet.topLevelComment.snippet.authorDisplayName ||
          "[deleted]";
        const body = comment.snippet.topLevelComment.snippet.textDisplay || "";
        const likeCount =
          comment.snippet.topLevelComment.snippet.likeCount || 0;
        const commentId = comment.id;
        const commentUrl = `https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`;

        return `
<blockquote>
<p><strong>${escapeHtml(author)}</strong> | ${likeCount} likes | <a href="${commentUrl}">source</a></p>
<div>${body}</div>
</blockquote>
`;
      });
      contentParts.push(commentHtmls.join(""));
    } else {
      contentParts.push("<p><em>No comments yet.</em></p>");
    }
  } else {
    contentParts.push("<p><em>Comments disabled.</em></p>");
  }

  return contentParts.join("\n");
}

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
   * Main aggregation method.
   *
   * Fetches videos from YouTube channel using Data API v3.
   *
   * **API calls made:**
   * 1. `channels.list(part="contentDetails", id=channel_id)` - Get uploads playlist ID
   * 2. `playlistItems.list(playlistId=uploads_playlist_id)` - Get video IDs from playlist
   * 3. `videos.list(part="snippet,statistics,contentDetails", id=video_ids)` - Get video details
   *
   * **Pagination:**
   * - Fetches up to 50 videos per request (API limit)
   * - Respects feed's `dailyPostLimit` if set
   * - Continues pagination until limit reached or no more videos
   */
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
    (this as any).__channelId = channelId;
  }

  /**
   * Apply rate limiting for YouTube API.
   */
  protected override async applyRateLimiting(): Promise<void> {
    // YouTube API has quota limits, apply rate limiting
    await super.applyRateLimiting();
  }

  /**
   * Fetch YouTube channel info and videos.
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
      "Fetching YouTube channel videos",
    );

    if (!this.feed) {
      throw new YouTubeAPIError("Feed not initialized");
    }

    const channelId = (this as any).__channelId as string;
    if (!channelId) {
      throw new YouTubeAPIError("Channel ID not resolved");
    }

    const apiKey = await this.getApiKey();

    // Apply rate limiting
    await this.applyRateLimiting();

    try {
      // Get channel's uploads playlist ID and thumbnail
      const channelResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            part: "contentDetails,snippet",
            id: channelId,
            key: apiKey,
          },
        },
      );

      if (
        !channelResponse.data.items ||
        channelResponse.data.items.length === 0
      ) {
        throw new YouTubeAPIError(`Channel not found: ${channelId}`);
      }

      const channel: YouTubeChannel = channelResponse.data.items[0];
      const uploadsPlaylistId =
        channel.contentDetails?.relatedPlaylists?.uploads;

      // Store channel icon URL for feed icon collection
      const snippet = (channelResponse.data.items[0] as any).snippet;
      if (snippet?.thumbnails) {
        const thumbnails = snippet.thumbnails;
        // Get highest quality thumbnail (prefer high quality first)
        for (const quality of ["high", "medium", "default"] as const) {
          if (thumbnails[quality]?.url) {
            this.channelIconUrl = thumbnails[quality].url;
            // Legacy support: also store in private property for backwards compatibility
            (this as any).__channelIconUrl = thumbnails[quality].url;
            break;
          }
        }
      }

      let videos: YouTubeVideo[] = [];
      const maxResults = limit || this.feed.dailyPostLimit || 50;

      if (!uploadsPlaylistId) {
        // Channel has no uploads playlist (rare, but possible)
        this.logger.warn(
          {
            step: "fetchSourceData",
            subStep: "fetchVideos",
            aggregator: this.id,
            feedId: this.feed?.id,
            channelId,
          },
          "Channel has no uploads playlist. Trying fallback method using search.list.",
        );
        videos = await this.fetchVideosViaSearch(channelId, maxResults, apiKey);
      } else {
        // Get videos from uploads playlist
        try {
          videos = await this.fetchVideosFromPlaylist(
            uploadsPlaylistId,
            maxResults,
            apiKey,
          );
        } catch (error) {
          // Handle playlist not found or inaccessible - fallback to search
          if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            const errorDetails = axiosError.message;
            if (
              errorDetails.includes("playlistNotFound") ||
              axiosError.response?.status === 404
            ) {
              this.logger.warn(
                {
                  step: "fetchSourceData",
                  subStep: "fetchVideos",
                  aggregator: this.id,
                  feedId: this.feed?.id,
                  channelId,
                  playlistId: uploadsPlaylistId,
                  error: axiosError,
                },
                "Uploads playlist not found or inaccessible. Trying fallback method using search.list.",
              );
              videos = await this.fetchVideosViaSearch(
                channelId,
                maxResults,
                apiKey,
              );
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        }
      }

      if (videos.length === 0) {
        this.logger.warn(
          {
            step: "fetchSourceData",
            subStep: "complete",
            aggregator: this.id,
            feedId: this.feed?.id,
            channelId,
          },
          "No videos found for channel",
        );
        return { videos: [], channelId };
      }

      const elapsed = Date.now() - startTime;
      this.logger.info(
        {
          step: "fetchSourceData",
          subStep: "complete",
          aggregator: this.id,
          feedId: this.feed?.id,
          channelId,
          videoCount: videos.length,
          elapsed,
        },
        "YouTube videos fetched",
      );

      return { videos, channelId };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (error instanceof YouTubeAPIError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const errorMsg = `YouTube API error: ${axiosError.message}`;
        this.logger.error(
          {
            step: "fetchSourceData",
            subStep: "error",
            aggregator: this.id,
            feedId: this.feed?.id,
            channelId,
            error: axiosError,
            elapsed,
          },
          errorMsg,
        );
        throw new YouTubeAPIError(errorMsg, axiosError);
      }
      const errorMsg = `Error fetching YouTube videos: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(
        {
          step: "fetchSourceData",
          subStep: "error",
          aggregator: this.id,
          feedId: this.feed?.id,
          channelId,
          error,
          elapsed,
        },
        errorMsg,
      );
      throw new YouTubeAPIError(errorMsg, error);
    }
  }

  /**
   * Parse YouTube videos to RawArticle[].
   */
  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "parseToRawArticles",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
      },
      "Parsing YouTube videos",
    );

    const { videos, channelId } = sourceData as {
      videos: YouTubeVideo[];
      channelId: string;
    };

    if (videos.length === 0) {
      return [];
    }

    const articles: RawArticle[] = [];

    for (const video of videos) {
      const videoId = video.id;
      const snippet = video.snippet;
      const statistics = video.statistics || {};
      const contentDetails = video.contentDetails || {};

      // Parse published date
      let published: Date;
      try {
        // YouTube API returns ISO 8601 format (e.g., "2023-01-01T12:00:00Z")
        // Replace Z with +00:00 for Date compatibility
        const publishedStr = snippet.publishedAt;
        if (publishedStr) {
          const dateStr = publishedStr.endsWith("Z")
            ? publishedStr.slice(0, -1) + "+00:00"
            : publishedStr;
          published = new Date(dateStr);
        } else {
          published = new Date();
        }
      } catch (error) {
        this.logger.warn(
          {
            step: "parseToRawArticles",
            subStep: "parseDate",
            aggregator: this.id,
            feedId: this.feed?.id,
            error,
            publishedAt: snippet.publishedAt,
          },
          "Failed to parse YouTube date",
        );
        published = new Date();
      }

      // Use current timestamp if feed is configured for it (default: True)
      const articleDate = this.feed?.useCurrentTimestamp
        ? new Date()
        : published;

      // Extract thumbnail URL
      const thumbnails = snippet.thumbnails;
      let thumbnailUrl = "";
      for (const quality of [
        "maxres",
        "standard",
        "high",
        "medium",
        "default",
      ] as const) {
        if (thumbnails[quality]) {
          thumbnailUrl = thumbnails[quality].url;
          break;
        }
      }
      if (!thumbnailUrl && videoId) {
        // Generate from video ID (YouTube default thumbnail)
        thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      }

      // Build video URL
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Get comment limit from options
      const commentLimit = this.getOption("comment_limit", 10) as number;

      // Get API key for fetching comments
      const apiKey = await this.getApiKey();

      // Generate HTML content with video description and comments
      const description = snippet.description || "";
      const content = await buildVideoContent(
        description,
        videoId,
        videoUrl,
        commentLimit,
        apiKey,
      );

      articles.push({
        title: snippet.title || "Untitled",
        url: videoUrl,
        published: articleDate,
        content,
        summary: description,
        thumbnailUrl,
        mediaUrl: (await import("./base/utils")).getYouTubeProxyUrl(videoId),
        mediaType: "video/youtube",
        externalId: videoId,
      });
    }

    const elapsed = Date.now() - startTime;
    this.logger.info(
      {
        step: "parseToRawArticles",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleCount: articles.length,
        elapsed,
      },
      "YouTube videos parsed",
    );

    return articles;
  }

  /**
   * Process content with YouTube-specific formatting.
   *
   * Note: YouTube video embedding is now handled automatically by the base
   * standardizeContentFormat function when it detects YouTube URLs, so this
   * override is no longer needed for embedding. We keep it for potential
   * future YouTube-specific processing.
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    // Use base implementation - it will automatically detect YouTube URLs
    // and embed them as iframes instead of extracting thumbnails
    return await super.processContent(html, article);
  }

  /**
   * Remove YouTube-specific elements (.ytd-app).
   */
  protected override async removeElementsBySelectors(
    html: string,
    article: RawArticle,
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
   * Fetch videos from uploads playlist.
   */
  private async fetchVideosFromPlaylist(
    playlistId: string,
    maxResults: number,
    apiKey: string,
  ): Promise<YouTubeVideo[]> {
    const videos: YouTubeVideo[] = [];
    let nextPageToken: string | undefined;

    try {
      while (videos.length < maxResults) {
        const playlistResponse = await axios.get(
          "https://www.googleapis.com/youtube/v3/playlistItems",
          {
            params: {
              part: "snippet,contentDetails",
              playlistId,
              maxResults: Math.min(50, maxResults - videos.length),
              pageToken: nextPageToken,
              key: apiKey,
            },
          },
        );

        const items: YouTubePlaylistItem[] = playlistResponse.data.items || [];
        if (items.length === 0) {
          break;
        }

        // Get video IDs
        const videoIds = items.map((item) => item.contentDetails.videoId);

        // Get detailed video information
        const videosResponse = await axios.get(
          "https://www.googleapis.com/youtube/v3/videos",
          {
            params: {
              part: "snippet,statistics,contentDetails",
              id: videoIds.join(","),
              key: apiKey,
            },
          },
        );

        videos.push(...(videosResponse.data.items || []));
        nextPageToken = playlistResponse.data.nextPageToken;
        if (!nextPageToken) {
          break;
        }
      }
    } catch (error) {
      // Re-raise errors - fallback handling is done in aggregate method
      throw error;
    }

    return videos;
  }

  /**
   * Fallback method to fetch videos using search.list when uploads playlist is unavailable.
   *
   * This method uses search.list to find videos from a channel, which works even when
   * the uploads playlist is not accessible or doesn't exist.
   */
  private async fetchVideosViaSearch(
    channelId: string,
    maxResults: number,
    apiKey: string,
  ): Promise<YouTubeVideo[]> {
    const videos: YouTubeVideo[] = [];
    let nextPageToken: string | undefined;

    try {
      while (videos.length < maxResults) {
        // Search for videos from this channel
        const searchResponse = await axios.get(
          "https://www.googleapis.com/youtube/v3/search",
          {
            params: {
              part: "id",
              channelId,
              type: "video",
              order: "date", // Most recent first
              maxResults: Math.min(50, maxResults - videos.length),
              pageToken: nextPageToken,
              key: apiKey,
            },
          },
        );

        const items = searchResponse.data.items || [];
        if (items.length === 0) {
          break;
        }

        // Get video IDs from search results
        const videoIds = items.map(
          (item: { id: { videoId: string } }) => item.id.videoId,
        );

        // Get detailed video information
        const videosResponse = await axios.get(
          "https://www.googleapis.com/youtube/v3/videos",
          {
            params: {
              part: "snippet,statistics,contentDetails",
              id: videoIds.join(","),
              key: apiKey,
            },
          },
        );

        videos.push(...(videosResponse.data.items || []));
        nextPageToken = searchResponse.data.nextPageToken;
        if (!nextPageToken) {
          break;
        }
      }

      this.logger.info(
        { channelId, videoCount: videos.length },
        "Fetched videos via search.list for channel",
      );
      return videos;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const errorDetails = axiosError.message;
        // Check if it's a quota or permission error vs. channel not found
        if (
          errorDetails.toLowerCase().includes("quota") ||
          axiosError.response?.status === 403
        ) {
          this.logger.error(
            { error: axiosError, channelId },
            "API quota exceeded or permission denied when fetching videos via search.list for channel",
          );
        } else if (
          errorDetails.toLowerCase().includes("notfound") ||
          axiosError.response?.status === 404
        ) {
          this.logger.warn(
            { error: axiosError, channelId },
            "Channel not found or has no public videos via search.list",
          );
        } else {
          this.logger.error(
            { error: axiosError, channelId },
            "Error fetching videos via search.list for channel",
          );
        }
      } else {
        this.logger.error(
          { error, channelId },
          "Error fetching videos via search.list for channel",
        );
      }
      // Return empty list if search also fails
      return [];
    }
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
      } catch (error) {
        // Try next quality
        continue;
      }
    }

    // If HEAD requests failed (timeout, network issue), return hqdefault directly
    // instead of fetching the entire YouTube page HTML (which is huge and slow)
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
}
