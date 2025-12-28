/**
 * YouTube video fetching utilities.
 */

import axios from "axios";

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
 * Extract channel icon URL from channel snippet.
 */
function extractChannelIconUrl(channel: YouTubeChannel): string | null {
  if (!channel.snippet?.thumbnails) return null;
  return (
    channel.snippet.thumbnails.high?.url ||
    channel.snippet.thumbnails.medium?.url ||
    channel.snippet.thumbnails.default?.url ||
    null
  );
}

/**
 * Fetch videos from channel uploads playlist with fallback.
 */
async function fetchVideosWithFallback(
  channelId: string,
  playlistId: string | undefined,
  maxResults: number,
  apiKey: string,
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | undefined,
): Promise<YouTubeVideo[]> {
  if (!playlistId) {
    logger.warn(
      {
        step: "fetchSourceData",
        subStep: "fetchVideos",
        aggregator: aggregatorId,
        feedId,
        channelId,
      },
      "No uploads playlist. Trying fallback search.",
    );
    return await fetchVideosViaSearch(channelId, maxResults, apiKey);
  }

  try {
    return await fetchVideosFromPlaylist(playlistId, maxResults, apiKey);
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.message.includes("playlistNotFound") ||
        error.response?.status === 404)
    ) {
      logger.warn(
        {
          step: "fetchSourceData",
          subStep: "fetchVideos",
          aggregator: aggregatorId,
          feedId,
          channelId,
          playlistId,
        },
        "Playlist inaccessible. Trying fallback search.",
      );
      return await fetchVideosViaSearch(channelId, maxResults, apiKey);
    }
    throw error;
  }
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
  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: { part: "contentDetails,snippet", id: channelId, key: apiKey },
      },
    );

    const channels: YouTubeChannel[] = response.data.items || [];
    if (channels.length === 0)
      throw new YouTubeAPIError(`Channel not found: ${channelId}`);

    const channel = channels[0];
    const channelIconUrl = extractChannelIconUrl(channel);
    const videos = await fetchVideosWithFallback(
      channelId,
      channel.contentDetails?.relatedPlaylists?.uploads,
      maxResults,
      apiKey,
      logger,
      aggregatorId,
      feedId,
    );

    return { videos, channelIconUrl };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    let errorMsg: string;
    if (axios.isAxiosError(error)) {
      errorMsg = `YouTube API error: ${error.message}`;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      errorMsg = `Error fetching YouTube videos: ${message}`;
    }
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
