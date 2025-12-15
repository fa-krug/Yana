/**
 * Image fetching utilities.
 */

import axios from "axios";
import sharp from "sharp";
import { logger } from "@server/utils/logger";

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

    // Determine MIME type
    let contentType = response.headers["content-type"] || "";
    const urlLower = url.toLowerCase();
    if (!contentType || contentType === "application/octet-stream") {
      // Try to guess from URL
      if (urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg")) {
        contentType = "image/jpeg";
      } else if (urlLower.endsWith(".png")) {
        contentType = "image/png";
      } else if (urlLower.endsWith(".gif")) {
        contentType = "image/gif";
      } else if (urlLower.endsWith(".webp")) {
        contentType = "image/webp";
      } else if (urlLower.endsWith(".ico")) {
        contentType = "image/vnd.microsoft.icon";
      } else {
        contentType = "image/jpeg";
      }
    } else {
      contentType = contentType.split(";")[0].trim();
    }

    // Validate that we actually got an image
    if (!contentType.startsWith("image/")) {
      logger.warn({ url, contentType }, "URL returned non-image content type");
      return { url, imageData: null, contentType: null };
    }

    const imageBuffer = Buffer.from(response.data);

    // Check if this is an ICO file (Sharp doesn't support ICO files at all)
    const isIco =
      contentType === "image/vnd.microsoft.icon" ||
      contentType === "image/x-icon" ||
      urlLower.endsWith(".ico");

    // Handle ICO files: Skip Sharp validation since ICO is a valid image format
    // that browsers can handle, even though Sharp doesn't support it
    if (isIco) {
      logger.debug(
        { url, size: imageBuffer.length },
        "Skipping Sharp validation for ICO file (Sharp doesn't support ICO)",
      );
      return { url, imageData: imageBuffer, contentType };
    }

    // Additional validation: Try to parse as image with sharp
    try {
      await sharp(imageBuffer).metadata(); // This will throw if not a valid image
      logger.debug(
        { url, contentType, size: imageBuffer.length },
        "Successfully validated image",
      );
      return { url, imageData: imageBuffer, contentType };
    } catch (error) {
      logger.warn(
        { url, contentType, error },
        "Content claims to be image but failed validation",
      );
      return { url, imageData: null, contentType: null };
    }
  } catch (error) {
    logger.warn({ error, url }, "Failed to fetch image");
    return { url, imageData: null, contentType: null };
  }
}
