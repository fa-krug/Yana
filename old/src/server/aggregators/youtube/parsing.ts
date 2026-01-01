/**
 * YouTube video parsing utilities.
 */

import { logger } from "@server/utils/logger";

import type { RawArticle } from "../base/types";

import { buildVideoContent } from "./content";
import type { YouTubeVideo } from "./videos";

/**
 * Log instrumentation trace (only in test environment).
 */
function logInstrumentation(message: string): void {
  if (
    process.env["NODE_ENV"] === "test" &&
    (global as { __TEST_TRACE?: boolean }).__TEST_TRACE
  ) {
    console.log(message);
  }
}

/**
 * Parse YouTube published date with fallback to current date.
 */
function parsePublishedDate(
  publishedAt: string | undefined,
  aggregatorId: string,
  feedId: number | undefined,
): Date {
  if (!publishedAt) {
    return new Date();
  }

  try {
    // YouTube API returns ISO 8601 format (e.g., "2023-01-01T12:00:00Z")
    // Replace Z with +00:00 for Date compatibility
    const dateStr = publishedAt.endsWith("Z")
      ? publishedAt.slice(0, -1) + "+00:00"
      : publishedAt;
    return new Date(dateStr);
  } catch (error) {
    logger.warn(
      {
        step: "parseToRawArticles",
        subStep: "parseDate",
        aggregator: aggregatorId,
        feedId,
        error,
        publishedAt,
      },
      "Failed to parse YouTube date",
    );
    return new Date();
  }
}

/**
 * Extract thumbnail URL with quality fallback.
 */
function extractThumbnailUrl(
  thumbnails: YouTubeVideo["snippet"]["thumbnails"],
  videoId: string,
): string {
  for (const quality of [
    "maxres",
    "standard",
    "high",
    "medium",
    "default",
  ] as const) {
    if (thumbnails[quality]) {
      return thumbnails[quality].url;
    }
  }
  // Generate from video ID (YouTube default thumbnail)
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Build a RawArticle from YouTube video data.
 */
async function buildRawArticle(
  video: YouTubeVideo,
  useCurrentTimestamp: boolean | undefined,
  published: Date,
  commentLimit: number,
  apiKey: string,
): Promise<RawArticle> {
  const videoId = video.id;
  const snippet = video.snippet;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const articleDate = useCurrentTimestamp ? new Date() : published;
  const thumbnailUrl = extractThumbnailUrl(snippet.thumbnails, videoId);
  const description = snippet.description || "";

  const content = await buildVideoContent(
    description,
    videoId,
    videoUrl,
    commentLimit,
    apiKey,
  );

  return {
    title: snippet.title || "Untitled",
    url: videoUrl,
    published: articleDate,
    content,
    summary: description,
    thumbnailUrl,
    mediaUrl: (await import("../base/utils")).getYouTubeProxyUrl(videoId),
    mediaType: "video/youtube",
    externalId: videoId,
  };
}

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
    logInstrumentation(
      `[PARSE_TRACE:youtube] videos.length is 0, returning empty array`,
    );
    return [];
  }

  logInstrumentation(
    `[PARSE_TRACE:youtube] parseToRawArticles called with ${videos.length} videos`,
  );

  const articles: RawArticle[] = [];

  for (const video of videos) {
    const published = parsePublishedDate(
      video.snippet.publishedAt,
      aggregatorId,
      feedId,
    );

    try {
      const article = await buildRawArticle(
        video,
        useCurrentTimestamp,
        published,
        commentLimit,
        apiKey,
      );
      articles.push(article);
    } catch (error) {
      logInstrumentation(
        `[PARSE_TRACE:youtube] buildVideoContent error for video ${video.id}:`,
      );
      // Re-throw to see the error
      throw error;
    }
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
