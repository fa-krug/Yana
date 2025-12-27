/**
 * Image fetching utilities.
 */

import axios from "axios";
import sharp from "sharp";

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../../exceptions";
import { is4xxError } from "../http-errors";
import { MimeTypeDetector } from "./mime-type-handlers";

/**
 * Get appropriate referer header for a URL.
 * Uses the origin of the URL as referer.
 */
export function getRefererHeader(url: string): string {
  try {
    const urlObj = new URL(url);
    // Use the origin as referer
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    logger.debug({ error, url }, "Failed to determine referer");
    // Safe fallback
    return "https://example.com";
  }
}

/**
 * Validate image content using Sharp metadata parsing.
 * Handles ICO files specially (skips Sharp validation).
 * Throws if not a valid image.
 */
async function validateImageContent(
  imageBuffer: Buffer,
  contentType: string,
  url: string,
): Promise<void> {
  // Check if this is an ICO file (Sharp doesn't support ICO files)
  const isIco =
    contentType === "image/vnd.microsoft.icon" ||
    contentType === "image/x-icon" ||
    url.toLowerCase().endsWith(".ico");

  // Skip Sharp validation for ICO files
  if (isIco) {
    logger.debug(
      { url, size: imageBuffer.length },
      "Skipping Sharp validation for ICO file (Sharp doesn't support ICO)",
    );
    return;
  }

  // Validate with Sharp
  try {
    await sharp(imageBuffer).metadata();
    logger.debug(
      { url, contentType, size: imageBuffer.length },
      "Successfully validated image",
    );
  } catch (error) {
    logger.warn(
      { url, contentType, error },
      "Content claims to be image but failed validation",
    );
    throw error;
  }
}

/**
 * Build standardized image result object.
 */
function buildImageResult(
  url: string,
  imageData: Buffer,
  contentType: string,
): { url: string; imageData: Buffer; contentType: string } {
  return { url, imageData, contentType };
}

/**
 * Fetch a single image from URL with validation.
 */
export async function fetchSingleImage(url: string): Promise<{
  url: string;
  imageData: Buffer | null;
  contentType: string | null;
}> {
  try {
    const referer = getRefererHeader(url);

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
    };

    const response = await axios.get(url, {
      headers,
      responseType: "arraybuffer",
      timeout: 10000,
      maxRedirects: 5,
    });

    // Detect MIME type using orchestrator
    const mimeDetector = new MimeTypeDetector();
    const contentType = mimeDetector.detect(
      url,
      response.headers["content-type"],
    );

    // Validate that we actually got an image
    if (!contentType || !contentType.startsWith("image/")) {
      logger.warn({ url, contentType }, "URL returned non-image content type");
      return { url, imageData: null, contentType: null };
    }

    const imageBuffer = Buffer.from(response.data);

    // Validate image content
    try {
      await validateImageContent(imageBuffer, contentType, url);
      return buildImageResult(url, imageBuffer, contentType);
    } catch (error) {
      return { url, imageData: null, contentType: null };
    }
  } catch (error) {
    // Check for 4xx errors - skip article on client errors
    const statusCode = is4xxError(error);
    if (statusCode !== null) {
      logger.warn(
        { error, url, statusCode },
        "4xx error fetching image, skipping article",
      );
      throw new ArticleSkipError(
        `Failed to fetch image: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        statusCode,
        error instanceof Error ? error : undefined,
      );
    }
    logger.warn({ error, url }, "Failed to fetch image");
    return { url, imageData: null, contentType: null };
  }
}
