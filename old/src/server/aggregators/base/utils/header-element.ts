/**
 * Header element generation utilities.
 * Creates HTML elements (img or iframe) from URLs with proper handling for
 * different URL types (images, YouTube, Twitter/X, Reddit, etc.).
 */
import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../exceptions";

import {
  GenericImageStrategy,
  RedditEmbedStrategy,
  RedditPostStrategy,
  YouTubeStrategy,
} from "./header-element-strategies";
import { HeaderElementOrchestrator } from "./header-element-strategy";
import { is4xxError } from "./http-errors";

/**
 * Create a header HTML element from a URL.
 *
 * Handles different URL types using Strategy pattern:
 * - Reddit embed URLs: returns embedded <iframe>
 * - Reddit post URLs: uses subreddit thumbnail, compresses, base64 encodes, returns <img>
 * - YouTube URLs: returns embedded <iframe>
 * - Direct image URLs: extracts, compresses, base64 encodes, returns <img>
 * - Twitter/X URLs: extracts image, compresses, base64 encodes, returns <img>
 * - Other URLs: attempts to extract image from page, compresses, base64 encodes, returns <img>
 *
 * @param url - The URL to process
 * @param alt - Optional alt text for image elements (default: "Article image")
 * @returns HTML string containing either an <img> tag with base64 data URI or iframe embed, or null if extraction fails
 */
export async function createHeaderElementFromUrl(
  url: string,
  alt: string = "Article image",
): Promise<string | null> {
  if (!url) {
    return null;
  }

  // Create orchestrator with strategies in priority order
  // IMPORTANT: RedditEmbedStrategy must come before RedditPostStrategy
  const orchestrator = new HeaderElementOrchestrator([
    new RedditEmbedStrategy(), // Must check before RedditPostStrategy
    new RedditPostStrategy(), // Reddit post icons
    new YouTubeStrategy(), // YouTube embeds
    new GenericImageStrategy(), // Fallback for all images
  ]);

  try {
    return await orchestrator.create(url, alt);
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
