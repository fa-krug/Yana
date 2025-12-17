/**
 * Header element generation utilities.
 * Creates HTML elements (img or iframe) from URLs with proper handling for
 * different URL types (images, YouTube, Twitter/X, Reddit, etc.).
 */

import { logger } from "@server/utils/logger";
import { extractImageFromUrl } from "./images/extract";
import {
  compressImage,
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "./compression";
import { extractYouTubeVideoId, getYouTubeProxyUrl } from "./youtube";
import { extractPostInfoFromUrl } from "../../reddit/urls";
import { fetchRedditIcon } from "@server/services/icon.service";
import { fetchSingleImage } from "./images";
import { is4xxError } from "./http-errors";
import { ArticleSkipError } from "../exceptions";

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
    // Check if it's a Reddit post URL - use subreddit thumbnail
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

    // Check if it's a YouTube URL - return embed instead of image
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      const embedUrl = getYouTubeProxyUrl(videoId);
      const embedHtml =
        `<div class="youtube-embed-container">` +
        `<iframe src="${embedUrl}" ` +
        `title="YouTube video player" ` +
        `frameborder="0" ` +
        `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
        `allowfullscreen></iframe>` +
        `</div>`;

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
    let imgHtml = `<p><img src="${dataUri}" alt="${alt}" style="max-width: 100%; height: auto;"></p>`;

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
