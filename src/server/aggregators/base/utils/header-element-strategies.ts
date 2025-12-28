/**
 * Concrete strategy implementations for header element creation.
 * Each strategy handles a specific URL type (Reddit, YouTube, images, etc.).
 */

import { fetchRedditIcon } from "@server/services/icon.service";
import { logger } from "@server/utils/logger";

import { extractPostInfoFromUrl } from "../../reddit/urls";
import { ArticleSkipError } from "../exceptions";

import {
  compressAndEncodeImage,
  createImageElement,
} from "./header-element-helpers";
import type {
  HeaderElementContext,
  HeaderElementStrategy,
} from "./header-element-strategy";
import { is4xxError } from "./http-errors";
import { fetchSingleImage } from "./images";
import { extractImageFromUrl } from "./images/extract";
import { createYouTubeEmbedHtml, extractYouTubeVideoId } from "./youtube";

/**
 * Check if URL is a Reddit video embed URL (vxreddit.com or reddit.com with /embed).
 */
function isRedditEmbedUrl(url: string): boolean {
  return (
    url.includes("vxreddit.com") ||
    (url.includes("/embed") &&
      (url.includes("reddit.com") || url.includes("v.redd.it")))
  );
}

/**
 * Create Reddit video embed HTML.
 * Returns HTML string that can be used directly or loaded into cheerio.
 *
 * @param embedUrl - Reddit embed URL (e.g., https://vxreddit.com/r/subreddit/comments/postId/title)
 * @param caption - Optional caption HTML to append after the iframe
 * @returns HTML string with reddit-embed-container div and iframe
 */
function createRedditEmbedHtml(embedUrl: string, caption?: string): string {
  const iframeHtml =
    `<div class="reddit-embed-container">` +
    `<style>` +
    `.reddit-embed-container iframe { width: 100%; height: calc((512px / 16) * 9); }` +
    `@media (max-width: 512px) { .reddit-embed-container iframe { height: calc((100vw / 16) * 9); } }` +
    `</style>` +
    `<iframe src="${embedUrl}" ` +
    `title="Reddit video player" ` +
    `frameborder="0" ` +
    `scrolling="no" ` +
    `allowfullscreen></iframe>` +
    (caption ? caption : "") +
    `</div>`;
  return iframeHtml;
}

/**
 * Strategy for Reddit video embed URLs.
 * Handles vxreddit.com and reddit.com/embed URLs.
 */
export class RedditEmbedStrategy implements HeaderElementStrategy {
  canHandle(url: string): boolean {
    return isRedditEmbedUrl(url);
  }

  async create(context: HeaderElementContext): Promise<string | null> {
    const embedHtml = createRedditEmbedHtml(context.url);
    logger.debug({ url: context.url }, "Created Reddit embed element");
    return embedHtml;
  }
}

/**
 * Strategy for Reddit post URLs.
 * Fetches subreddit icon and creates compressed base64 image.
 */
export class RedditPostStrategy implements HeaderElementStrategy {
  canHandle(url: string): boolean {
    // Must NOT be an embed URL (RedditEmbedStrategy handles those)
    if (isRedditEmbedUrl(url)) {
      return false;
    }

    const postInfo = extractPostInfoFromUrl(url);
    return postInfo.subreddit !== null;
  }

  async create(context: HeaderElementContext): Promise<string | null> {
    const postInfo = extractPostInfoFromUrl(context.url);
    if (!postInfo.subreddit) {
      return null;
    }

    logger.debug(
      { url: context.url, subreddit: postInfo.subreddit },
      "Detected Reddit post URL, fetching subreddit thumbnail",
    );

    try {
      // Fetch subreddit icon URL
      const iconUrl = await fetchRedditIcon(postInfo.subreddit);

      if (!iconUrl) {
        logger.debug(
          { url: context.url, subreddit: postInfo.subreddit },
          "No subreddit icon found",
        );
        return null;
      }

      // Fetch the icon image
      const imageResult = await fetchSingleImage(iconUrl);

      if (!imageResult.imageData || !imageResult.contentType) {
        logger.debug(
          { url: context.url, subreddit: postInfo.subreddit, iconUrl },
          "Failed to fetch subreddit icon image",
        );
        return null;
      }

      // Compress and encode
      const { dataUri, size, outputType } = await compressAndEncodeImage(
        imageResult.imageData,
        imageResult.contentType,
      );

      // Create img element
      const imgHtml = createImageElement(dataUri, context.alt);

      logger.debug(
        {
          url: context.url,
          subreddit: postInfo.subreddit,
          contentType: outputType,
          size,
        },
        "Created base64 image element from subreddit thumbnail",
      );

      return imgHtml;
    } catch (error) {
      // Check for 4xx errors - skip article on client errors
      const statusCode = is4xxError(error);
      if (statusCode !== null) {
        logger.warn(
          {
            error,
            url: context.url,
            subreddit: postInfo.subreddit,
            statusCode,
          },
          "4xx error fetching subreddit thumbnail, skipping article",
        );
        throw new ArticleSkipError(
          `Failed to fetch subreddit thumbnail: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          statusCode,
          error instanceof Error ? error : undefined,
        );
      }

      // Other errors: log and return null to try next strategy
      logger.warn(
        { error, url: context.url, subreddit: postInfo.subreddit },
        "Failed to fetch subreddit thumbnail, falling back to default extraction",
      );
      return null;
    }
  }
}

/**
 * Strategy for YouTube URLs.
 * Creates YouTube iframe embed.
 */
export class YouTubeStrategy implements HeaderElementStrategy {
  canHandle(url: string): boolean {
    return extractYouTubeVideoId(url) !== null;
  }

  async create(context: HeaderElementContext): Promise<string | null> {
    const videoId = extractYouTubeVideoId(context.url);
    if (!videoId) {
      return null;
    }

    const embedHtml = createYouTubeEmbedHtml(videoId);

    logger.debug(
      { url: context.url, videoId },
      "Created YouTube embed element",
    );
    return embedHtml;
  }
}

/**
 * Generic fallback strategy for all other URLs.
 * Attempts to extract image from page and create base64 image element.
 */
export class GenericImageStrategy implements HeaderElementStrategy {
  canHandle(url: string): boolean {
    // Skip v.redd.it URLs that aren't embeds
    // (They don't work for image extraction)
    if (url.includes("v.redd.it")) {
      logger.debug(
        { url },
        "Found v.redd.it URL but not an embed URL, skipping",
      );
      return false;
    }

    // Fallback strategy - handles all remaining URLs
    return true;
  }

  async create(context: HeaderElementContext): Promise<string | null> {
    logger.debug(
      { url: context.url },
      "Extracting image from URL for header element",
    );

    // Use extractImageFromUrl which handles:
    // - Direct image URLs
    // - Twitter/X URLs (via handleTwitterImage)
    // - Reddit images (will be handled as direct images or page extraction)
    // - Other URLs (via page scraping)
    const imageResult = await extractImageFromUrl(context.url, true);

    if (!imageResult) {
      logger.debug({ url: context.url }, "Failed to extract image from URL");
      return null;
    }

    const { imageData, contentType } = imageResult;

    // Compress and encode
    const { dataUri, size, outputType } = await compressAndEncodeImage(
      imageData,
      contentType,
    );

    // Create img element
    const imgHtml = createImageElement(dataUri, context.alt);

    logger.debug(
      { url: context.url, contentType: outputType, size },
      "Created base64 image element",
    );

    return imgHtml;
  }
}
