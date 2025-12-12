/**
 * YouTube video fetching utilities.
 */

import axios, { AxiosError } from "axios";
import { logger } from "@server/utils/logger";

/**
 * YouTube video interface.
 */
export interface YouTubeVideo {
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

/**
 * YouTube playlist item interface.
 */
interface YouTubePlaylistItem {
  contentDetails: {
    videoId: string;
  };
  snippet: {
    publishedAt: string;
  };
}

/**
 * Fetch videos from uploads playlist.
 */
export async function fetchVideosFromPlaylist(
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
export async function fetchVideosViaSearch(
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

    logger.info(
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
        logger.error(
          { error: axiosError, channelId },
          "API quota exceeded or permission denied when fetching videos via search.list for channel",
        );
      } else if (
        errorDetails.toLowerCase().includes("notfound") ||
        axiosError.response?.status === 404
      ) {
        logger.warn(
          { error: axiosError, channelId },
          "Channel not found or has no public videos via search.list",
        );
      } else {
        logger.error(
          { error: axiosError, channelId },
          "Error fetching videos via search.list for channel",
        );
      }
    } else {
      logger.error(
        { error, channelId },
        "Error fetching videos via search.list for channel",
      );
    }
    // Return empty list if search also fails
    return [];
  }
}
