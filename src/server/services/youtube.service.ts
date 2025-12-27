/**
 * YouTube service.
 *
 * Handles YouTube API authentication and channel search functionality.
 */

import axios from "axios";

import { logger } from "../utils/logger";

import { fetchChannelDetailsWithFallback } from "./youtube-channel-detail-fetcher";
import {
  testYouTubeCredentials,
  type YouTubeCredentials,
  type YouTubeTestResult,
} from "./youtube-credentials-tester";
import { mapAxiosErrorToMessage } from "./youtube-error-mapper";

// Re-export for backward compatibility
export { testYouTubeCredentials };
export type { YouTubeCredentials, YouTubeTestResult };

export interface YouTubeChannelSearchResult {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  handle: string | null;
}

/**
 * Search YouTube channels using YouTube Data API v3.
 * Returns a list of channels matching the search query.
 *
 * Note: This requires a valid YouTube API key. The API key should be passed
 * as a parameter, but for now we'll need to get it from user settings.
 * This function should be called from a context where we have access to user settings.
 */
export async function searchYouTubeChannels(
  query: string,
  apiKey: string,
  limit: number = 25,
): Promise<YouTubeChannelSearchResult[]> {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("YouTube API key is required");
  }

  try {
    const searchResults = await fetchSearchResults(query, apiKey, limit);

    if (!searchResults?.items) {
      return [];
    }

    const channels = await Promise.all(
      searchResults.items
        .filter((item) => item.snippet && item.id?.channelId)
        .map((item) =>
          fetchChannelDetailsWithFallback(item, item.snippet, apiKey),
        ),
    );

    logger.info(
      { query, count: channels.length },
      "Successfully searched YouTube channels",
    );
    return channels;
  } catch (error) {
    logger.error({ error, query }, "Error searching YouTube channels");

    if (axios.isAxiosError(error)) {
      throw new Error(mapAxiosErrorToMessage(error));
    }

    throw error;
  }
}

/**
 * Fetch search results from YouTube search API.
 */
async function fetchSearchResults(
  query: string,
  apiKey: string,
  limit: number,
): Promise<any> {
  const url = "https://www.googleapis.com/youtube/v3/search";
  const response = await axios.get(url, {
    params: {
      part: "snippet",
      q: query,
      type: "channel",
      maxResults: Math.min(limit, 50), // YouTube API max is 50
      key: apiKey,
      order: "relevance",
    },
    timeout: 10000,
  });

  return response.data;
}
