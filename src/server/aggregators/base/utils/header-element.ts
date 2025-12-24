/**
 * Header element generation utilities.
 * Creates HTML elements (img or iframe) from URLs with proper handling for
 * different URL types (images, YouTube, Twitter/X, Reddit, etc.).
 */
import { fetchRedditIcon } from "@server/services/icon.service";
import { logger } from "@server/utils/logger";

import { extractPostInfoFromUrl } from "../../reddit/urls";
import { ArticleSkipError } from "../exceptions";

import {
  compressImage,
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "./compression";
import { is4xxError } from "./http-errors";
import { fetchSingleImage } from "./images";
import { extractImageFromUrl } from "./images/extract";
import { extractYouTubeVideoId, createYouTubeEmbedHtml } from "./youtube";

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
 * Create a header HTML element from a URL.
 *
 * Handles different URL types:
 * - Direct image URLs: extracts, compresses, base64 encodes, returns <img>
 * - YouTube URLs: returns embedded <iframe>
 * - Twitter/X URLs: extracts image, compresses, base64 encodes, returns <img>
 * - Reddit post URLs: uses subreddit thumbnail, compresses, base64 encodes, returns <img>
 * - Reddit image URLs: extracts, compresses, base64 encodes, returns <img>
 * - Other URLs: attempts to extract image from page, compresses, base64 encodes, returns <img>
 *
 * @param url - The URL to process
 * @param alt - Optional alt text for image elements (default: "Article image")
 * @returns HTML string containing either an <img> tag with base64 data URI or YouTube <iframe> embed, or null if extraction fails
 */
export async function createHeaderElementFromUrl(
  url: string,
  alt: string = "Article image",
): Promise<string | null> {
  if (!url) {
    return null;
  }

  try {
    // Check if it's a Reddit embed URL - return iframe embed (must check BEFORE Reddit post URL check)
    if (isRedditEmbedUrl(url)) {
      const embedHtml = createRedditEmbedHtml(url);
      logger.debug({ url }, "Created Reddit embed element");
      return embedHtml;
    }

    // Check if it's a Reddit post URL - use subreddit thumbnail (but NOT embed URLs)
    const postInfo = extractPostInfoFromUrl(url);
    if (postInfo.subreddit) {
      logger.debug(
        { url, subreddit: postInfo.subreddit },
        "Detected Reddit post URL, fetching subreddit thumbnail",
      );

      try {
        // Fetch subreddit icon URL
        const iconUrl = await fetchRedditIcon(postInfo.subreddit);

        if (iconUrl) {
          // Fetch the icon image
          const imageResult = await fetchSingleImage(iconUrl);

          if (imageResult.imageData && imageResult.contentType) {
            // Compress the image with header image dimensions
            const compressed = await compressImage(
              imageResult.imageData,
              imageResult.contentType,
              MAX_HEADER_IMAGE_WIDTH,
              MAX_HEADER_IMAGE_HEIGHT,
            );
            const compressedData = compressed.imageData;
            const outputType = compressed.contentType;

            // Convert to base64
            const imageB64 = compressedData.toString("base64");
            const dataUri = `data:${outputType};base64,${imageB64}`;

            // Create img element with base64 data URI
            const imgHtml = `<p><img src="${dataUri}" alt="${alt}" style="max-width: 100%; height: auto;"></p>`;

            logger.debug(
              {
                url,
                subreddit: postInfo.subreddit,
                contentType: outputType,
                size: compressedData.length,
              },
              "Created base64 image element from subreddit thumbnail",
            );

            return imgHtml;
          } else {
            logger.debug(
              { url, subreddit: postInfo.subreddit, iconUrl },
              "Failed to fetch subreddit icon image",
            );
          }
        } else {
          logger.debug(
            { url, subreddit: postInfo.subreddit },
            "No subreddit icon found",
          );
        }
      } catch (error) {
        // Check for 4xx errors - skip article on client errors
        const statusCode = is4xxError(error);
        if (statusCode !== null) {
          logger.warn(
            { error, url, subreddit: postInfo.subreddit, statusCode },
            "4xx error fetching subreddit thumbnail, skipping article",
          );
          throw new ArticleSkipError(
            `Failed to fetch subreddit thumbnail: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            statusCode,
            error instanceof Error ? error : undefined,
          );
        }
        logger.warn(
          { error, url, subreddit: postInfo.subreddit },
          "Failed to fetch subreddit thumbnail, falling back to default extraction",
        );
        // Fall through to default extraction
      }
    }

    // Check if it's a v.redd.it URL - construct embed URL
    if (url.includes("v.redd.it")) {
      // Try to extract post info from article URL if available
      // For now, we'll need the article URL passed in, but since we don't have it here,
      // we'll check if the URL itself contains enough info or if we need to handle it differently
      // Actually, v.redd.it URLs in extractHeaderImageUrl are already converted to embed URLs,
      // so this check might not be needed here, but let's keep it as a fallback
      logger.debug(
        { url },
        "Found v.redd.it URL but not an embed URL, skipping",
      );
      // Return null so it falls through to image extraction (which will fail gracefully)
      return null;
    }

    // Check if it's a YouTube URL - return embed instead of image
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      const embedHtml = createYouTubeEmbedHtml(videoId);

      logger.debug({ url, videoId }, "Created YouTube embed element");
      return embedHtml;
    }

    // For all other URLs, extract image and create base64 img element
    logger.debug({ url }, "Extracting image from URL for header element");

    // Use extractImageFromUrl which handles:
    // - Direct image URLs
    // - Twitter/X URLs (via handleTwitterImage)
    // - Reddit images (will be handled as direct images or page extraction)
    // - Other URLs (via page scraping)
    const imageResult = await extractImageFromUrl(url, true);

    if (!imageResult) {
      logger.debug({ url }, "Failed to extract image from URL");
      return null;
    }

    const { imageData, contentType } = imageResult;

    // Compress the image with header image dimensions
    const compressed = await compressImage(
      imageData,
      contentType,
      MAX_HEADER_IMAGE_WIDTH,
      MAX_HEADER_IMAGE_HEIGHT,
    );
    const compressedData = compressed.imageData;
    const outputType = compressed.contentType;

    // Convert to base64
    const imageB64 = compressedData.toString("base64");
    const dataUri = `data:${outputType};base64,${imageB64}`;

    // Create img element with base64 data URI
    const imgHtml = `<p><img src="${dataUri}" alt="${alt}" style="max-width: 100%; height: auto;"></p>`;

    logger.debug(
      { url, contentType: outputType, size: compressedData.length },
      "Created base64 image element",
    );

    return imgHtml;
  } catch (error) {
    // Check for 4xx errors - skip article on client errors
    const statusCode = is4xxError(error);
    if (statusCode !== null) {
      logger.warn(
        { error, url, statusCode },
        "4xx error creating header element, skipping article",
      );
      throw new ArticleSkipError(
        `Failed to create header element: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        statusCode,
        error instanceof Error ? error : undefined,
      );
    }
    logger.warn({ error, url }, "Failed to create header element from URL");
    return null;
  }
}
