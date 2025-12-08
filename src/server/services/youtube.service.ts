/**
 * YouTube service.
 *
 * Handles YouTube API authentication and credential testing.
 */

import axios from "axios";
import { logger } from "../utils/logger";

export interface YouTubeCredentials {
  apiKey: string;
}

export interface YouTubeTestResult {
  success: boolean;
  errors?: {
    apiKey?: string;
    general?: string;
  };
}

/**
 * Test YouTube credentials by attempting to make a simple API call.
 */
export async function testYouTubeCredentials(
  credentials: YouTubeCredentials,
): Promise<YouTubeTestResult> {
  const errors: YouTubeTestResult["errors"] = {};

  // Validate required fields
  if (!credentials.apiKey || credentials.apiKey.trim() === "") {
    errors.apiKey = "API Key is required";
    return { success: false, errors };
  }

  try {
    // Test credentials by making a simple API call to list channels
    // Using a well-known channel ID (YouTube's own channel) for testing
    const testChannelId = "UCBR8-60-B28hp2BmDPdntcQ"; // YouTube's official channel
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "id",
          id: testChannelId,
          key: credentials.apiKey,
        },
        timeout: 10000, // 10 second timeout
      },
    );

    // If we get a successful response, credentials are valid
    if (response.status === 200) {
      // Check if the API returned an error in the response body
      if (response.data.error) {
        const error = response.data.error;
        if (error.code === 400) {
          errors.apiKey = "Invalid API Key";
          errors.general = "Invalid API Key";
        } else if (error.code === 403) {
          errors.apiKey = "API Key is restricted or quota exceeded";
          errors.general =
            "API Key is restricted or quota exceeded. Check API restrictions in Google Cloud Console.";
        } else {
          errors.general = error.message || "YouTube API error";
        }
        return { success: false, errors };
      }

      // Success - API key is valid
      logger.info("YouTube credentials test successful");
      return { success: true };
    }

    // Unexpected response
    errors.general = "Invalid response from YouTube API";
    return { success: false, errors };
  } catch (error) {
    logger.warn({ error }, "YouTube credentials test failed");

    if (axios.isAxiosError(error)) {
      // Handle specific HTTP errors
      if (error.response?.status === 400) {
        errors.apiKey = "Invalid API Key";
        errors.general = "Invalid API Key";
      } else if (error.response?.status === 403) {
        // Check if it's a quota error or permission error
        const errorData = error.response.data;
        if (errorData?.error?.errors?.[0]?.reason === "quotaExceeded") {
          errors.general =
            "YouTube API quota exceeded. Please try again later.";
        } else if (
          errorData?.error?.errors?.[0]?.reason === "accessNotConfigured"
        ) {
          errors.general =
            "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.";
        } else {
          errors.apiKey = "API Key is restricted or invalid";
          errors.general =
            "API Key is restricted or invalid. Check API restrictions in Google Cloud Console.";
        }
      } else if (error.response?.status === 401) {
        errors.apiKey = "Invalid API Key";
        errors.general = "Invalid API Key";
      } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        errors.general =
          "Connection timeout. Please check your internet connection.";
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        errors.general =
          "Cannot connect to YouTube API. Please check your internet connection.";
      } else {
        // Other HTTP errors
        const errorData = error.response?.data;
        errors.general =
          errorData?.error?.message ||
          `YouTube API error: ${error.response?.statusText || error.message}`;
      }
    } else {
      // Non-Axios errors
      errors.general = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return { success: false, errors };
  }
}

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

    const channels: YouTubeChannelSearchResult[] = [];

    if (response.data?.items) {
      for (const item of response.data.items) {
        const snippet = item.snippet;
        if (snippet && item.id?.channelId) {
          // Get additional channel details (subscriber count, handle)
          try {
            const channelDetailsResponse = await axios.get(
              "https://www.googleapis.com/youtube/v3/channels",
              {
                params: {
                  part: "snippet,statistics",
                  id: item.id.channelId,
                  key: apiKey,
                },
                timeout: 10000,
              },
            );

            const channelDetails = channelDetailsResponse.data?.items?.[0];
            const channelSnippet = channelDetails?.snippet;
            const channelStatistics = channelDetails?.statistics;

            // Extract handle from customUrl or try to find it
            let handle: string | null = null;
            if (channelSnippet?.customUrl) {
              handle = channelSnippet.customUrl.replace("@", "");
            } else if (channelSnippet?.handle) {
              handle = channelSnippet.handle.replace("@", "");
            }

            channels.push({
              channelId: item.id.channelId,
              title: snippet.title || "",
              description: snippet.description || "",
              thumbnailUrl:
                snippet.thumbnails?.high?.url ||
                snippet.thumbnails?.default?.url ||
                null,
              subscriberCount: parseInt(
                channelStatistics?.subscriberCount || "0",
                10,
              ),
              handle: handle,
            });
          } catch (detailError) {
            // If we can't get details, still add the channel with basic info
            logger.warn(
              { error: detailError, channelId: item.id.channelId },
              "Could not fetch channel details, using basic info",
            );
            channels.push({
              channelId: item.id.channelId,
              title: snippet.title || "",
              description: snippet.description || "",
              thumbnailUrl:
                snippet.thumbnails?.high?.url ||
                snippet.thumbnails?.default?.url ||
                null,
              subscriberCount: 0,
              handle: null,
            });
          }
        }
      }
    }

    logger.info(
      { query, count: channels.length },
      "Successfully searched YouTube channels",
    );
    return channels;
  } catch (error) {
    logger.error({ error, query }, "Error searching YouTube channels");
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 403) {
        const errorData = error.response.data;
        if (errorData?.error?.errors?.[0]?.reason === "quotaExceeded") {
          throw new Error(
            "YouTube API quota exceeded. Please try again later.",
          );
        }
        throw new Error(
          "YouTube API access denied. Check API key restrictions in Google Cloud Console.",
        );
      }
      if (error.response?.status === 400) {
        throw new Error("Invalid search query or API key.");
      }
      throw new Error(
        `YouTube API error: ${error.response?.statusText || error.message}`,
      );
    }
    throw error;
  }
}
