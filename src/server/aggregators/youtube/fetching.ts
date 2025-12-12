/**
 * YouTube video fetching utilities.
 */

import axios, { AxiosError } from "axios";
import { logger } from "@server/utils/logger";
import { YouTubeAPIError } from "./errors";
import {
  fetchVideosFromPlaylist,
  fetchVideosViaSearch,
  type YouTubeVideo,
} from "./videos";

/**
 * YouTube channel interface.
 */
interface YouTubeChannel {
  id: string;
  contentDetails: {
    relatedPlaylists: {
      uploads?: string;
    };
  };
  snippet?: {
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

/**
 * Fetch YouTube channel info and videos.
 */
export async function fetchYouTubeChannelData(
  channelId: string,
  maxResults: number,
  apiKey: string,
  aggregatorId: string,
  feedId: number | undefined,
): Promise<{
  videos: YouTubeVideo[];
  channelIconUrl: string | null;
}> {
  const startTime = Date.now();
  logger.info(
    {
      step: "fetchSourceData",
      subStep: "start",
      aggregator: aggregatorId,
      feedId,
      channelId,
      maxResults,
    },
    "Fetching YouTube channel data",
  );

  try {
    // Get channel info including uploads playlist ID
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

    const channels: YouTubeChannel[] = channelResponse.data.items || [];
    if (channels.length === 0) {
      throw new YouTubeAPIError(`Channel not found: ${channelId}`);
    }

    const channel = channels[0];
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

    // Extract channel icon URL
    let channelIconUrl: string | null = null;
    if (channel.snippet?.thumbnails) {
      channelIconUrl =
        channel.snippet.thumbnails.high?.url ||
        channel.snippet.thumbnails.medium?.url ||
        channel.snippet.thumbnails.default?.url ||
        null;
    }

    let videos: YouTubeVideo[] = [];

    if (!uploadsPlaylistId) {
      logger.warn(
        {
          step: "fetchSourceData",
          subStep: "fetchVideos",
          aggregator: aggregatorId,
          feedId,
          channelId,
        },
        "Channel has no uploads playlist. Trying fallback method using search.list.",
      );
      videos = await fetchVideosViaSearch(channelId, maxResults, apiKey);
    } else {
      // Get videos from uploads playlist
      try {
        videos = await fetchVideosFromPlaylist(
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
            logger.warn(
              {
                step: "fetchSourceData",
                subStep: "fetchVideos",
                aggregator: aggregatorId,
                feedId,
                channelId,
                playlistId: uploadsPlaylistId,
                error: axiosError,
              },
              "Uploads playlist not found or inaccessible. Trying fallback method using search.list.",
            );
            videos = await fetchVideosViaSearch(channelId, maxResults, apiKey);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(
      {
        step: "fetchSourceData",
        subStep: "complete",
        aggregator: aggregatorId,
        feedId,
        channelId,
        videoCount: videos.length,
        elapsed,
      },
      "YouTube channel data fetched",
    );

    return { videos, channelIconUrl };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const errorMsg = `YouTube API error: ${axiosError.message}`;
      logger.error(
        {
          step: "fetchSourceData",
          subStep: "error",
          aggregator: aggregatorId,
          feedId,
          channelId,
          error: axiosError,
          elapsed,
        },
        errorMsg,
      );
      throw new YouTubeAPIError(errorMsg, axiosError);
    }
    const errorMsg = `Error fetching YouTube videos: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(
      {
        step: "fetchSourceData",
        subStep: "error",
        aggregator: aggregatorId,
        feedId,
        channelId,
        error,
        elapsed,
      },
      errorMsg,
    );
    throw new YouTubeAPIError(errorMsg, error);
  }
}
