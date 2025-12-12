/**
 * YouTube video parsing utilities.
 */

import type { RawArticle } from "../base/types";
import { logger } from "../../utils/logger";
import { buildVideoContent } from "./content";
import type { YouTubeVideo } from "./videos";

/**
 * Parse YouTube videos to RawArticle[].
 */
export async function parseYouTubeVideos(
  videos: YouTubeVideo[],
  channelId: string,
  commentLimit: number,
  apiKey: string,
  aggregatorId: string,
  feedId: number | undefined,
  useCurrentTimestamp: boolean | undefined,
): Promise<RawArticle[]> {
  const startTime = Date.now();
  logger.info(
    {
      step: "parseToRawArticles",
      subStep: "start",
      aggregator: aggregatorId,
      feedId,
    },
    "Parsing YouTube videos",
  );

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
      logger.warn(
        {
          step: "parseToRawArticles",
          subStep: "parseDate",
          aggregator: aggregatorId,
          feedId,
          error,
          publishedAt: snippet.publishedAt,
        },
        "Failed to parse YouTube date",
      );
      published = new Date();
    }

    // Use current timestamp if feed is configured for it (default: True)
    const articleDate = useCurrentTimestamp ? new Date() : published;

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
      mediaUrl: (await import("../base/utils")).getYouTubeProxyUrl(videoId),
      mediaType: "video/youtube",
      externalId: videoId,
    });
  }

  const elapsed = Date.now() - startTime;
  logger.info(
    {
      step: "parseToRawArticles",
      subStep: "complete",
      aggregator: aggregatorId,
      feedId,
      articleCount: articles.length,
      elapsed,
    },
    "YouTube videos parsed",
  );

  return articles;
}
