/**
 * YouTube channel detail fetching strategy with fallback handling.
 *
 * Fetches additional channel details (subscriber count, handle) from YouTube API.
 * Handles failures gracefully by falling back to basic search result information.
 */

import axios from "axios";

import { logger } from "../utils/logger";

import type {
  YouTubeChannelDetails,
  YouTubeSearchItem,
  YouTubeSnippet,
} from "./youtube-api-types";
import { transformChannelDetails } from "./youtube-channel-transformer";
import type { YouTubeChannelSearchResult } from "./youtube.service";

/**
 * Fetch detailed channel information from YouTube API.
 * Includes subscriber count and custom handle if available.
 */
async function fetchChannelDetailsFromAPI(
  channelId: string,
  apiKey: string,
): Promise<YouTubeChannelDetails | undefined> {
  const response = await axios.get(
    "https://www.googleapis.com/youtube/v3/channels",
    {
      params: {
        part: "snippet,statistics",
        id: channelId,
        key: apiKey,
      },
      timeout: 10000,
    },
  );

  return response.data?.items?.[0];
}

/**
 * Fetch channel details with graceful fallback to basic information.
 *
 * Attempts to fetch detailed channel information (subscriber count, handle) from
 * the YouTube API. If the detail fetch fails, returns the channel with basic
 * information from the search result.
 */
export async function fetchChannelDetailsWithFallback(
  searchItem: YouTubeSearchItem,
  searchSnippet: YouTubeSnippet,
  apiKey: string,
): Promise<YouTubeChannelSearchResult> {
  const channelId = searchItem.id?.channelId;

  try {
    const channelDetails = await fetchChannelDetailsFromAPI(channelId, apiKey);
    return transformChannelDetails(searchItem, searchSnippet, channelDetails);
  } catch (detailError) {
    // Log the error but don't fail the entire search
    logger.warn(
      { error: detailError, channelId },
      "Could not fetch channel details, using basic info",
    );

    // Fall back to basic information from search result
    return transformChannelDetails(searchItem, searchSnippet);
  }
}
