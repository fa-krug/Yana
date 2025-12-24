/**
 * Thumbnail extraction utilities.
 */

import axios from "axios";
import * as cheerio from "cheerio";

import { logger } from "@server/utils/logger";

import { fetchSingleImage } from "./images";

/**
 * Convert a thumbnail URL to a base64 data URI.
 * Fetches the image and converts it to a data URI format.
 */
export async function convertThumbnailUrlToBase64(
  thumbnailUrl: string | null | undefined,
): Promise<string | null> {
  if (!thumbnailUrl) {
    return null;
  }

  // If it's already a data URI, return as-is
  if (thumbnailUrl.startsWith("data:")) {
    return thumbnailUrl;
  }

  try {
    const result = await fetchSingleImage(thumbnailUrl);
    if (result.imageData && result.contentType) {
      const base64 = result.imageData.toString("base64");
      const dataUri = `data:${result.contentType};base64,${base64}`;
      logger.debug(
        { url: thumbnailUrl, contentType: result.contentType },
        "Converted thumbnail URL to base64",
      );
      return dataUri;
    }
  } catch (error) {
    logger.warn(
      { error, url: thumbnailUrl },
      "Failed to convert thumbnail URL to base64",
    );
  }

  return null;
}

/**
 * Extract thumbnail URL from a web page by fetching it and parsing meta tags.
 * This is a lightweight version that only extracts the URL, not the image data.
 * @deprecated Use extractThumbnailUrlFromPageAndConvertToBase64 instead for base64 storage
 */
export async function extractThumbnailUrlFromPage(
  url: string,
): Promise<string | null> {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };

    const response = await axios.get(url, {
      headers,
      timeout: 10000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Strategy 1: Try og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) {
      const imageUrl = new URL(ogImage, url).toString();
      logger.debug({ imageUrl }, "Found og:image");
      return imageUrl;
    }

    // Strategy 2: Try twitter:image meta tag
    const twitterImage = $('meta[name="twitter:image"]').attr("content");
    if (twitterImage) {
      const imageUrl = new URL(twitterImage, url).toString();
      logger.debug({ imageUrl }, "Found twitter:image");
      return imageUrl;
    }

    // Strategy 3: Try to find first meaningful image
    const firstImg = $("img").first();
    if (firstImg.length > 0) {
      const imgSrc =
        firstImg.attr("src") ||
        firstImg.attr("data-src") ||
        firstImg.attr("data-lazy-src");
      if (imgSrc) {
        const imageUrl = new URL(imgSrc, url).toString();
        logger.debug({ imageUrl }, "Found first image");
        return imageUrl;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error, url }, "Failed to extract thumbnail URL from page");
    return null;
  }
}

/**
 * Extract thumbnail from a web page and convert it to base64 data URI.
 * This fetches the image and returns it as a base64 data URI for database storage.
 */
export async function extractThumbnailUrlFromPageAndConvertToBase64(
  url: string,
): Promise<string | null> {
  try {
    // First extract the thumbnail URL
    const thumbnailUrl = await extractThumbnailUrlFromPage(url);
    if (!thumbnailUrl) {
      return null;
    }

    // Convert to base64
    return await convertThumbnailUrlToBase64(thumbnailUrl);
  } catch (error) {
    logger.debug(
      { error, url },
      "Failed to extract and convert thumbnail to base64",
    );
    return null;
  }
}

/**
 * Extract the first base64 data URI image from HTML content.
 * This is useful when header images are embedded in content but thumbnail conversion failed.
 */
export function extractBase64ImageFromContent(content: string): string | null {
  if (!content) {
    return null;
  }

  // Pattern to match data URI images in img src attributes
  const pattern =
    /<img[^>]*\ssrc=(["']?)(data:image\/[^;]+;base64,[^"'>\s]+)\1/gi;

  const match = pattern.exec(content);
  if (match && match[2]) {
    const dataUri = match[2];
    // Validate it's actually a data URI
    if (dataUri.startsWith("data:image/") && dataUri.includes(";base64,")) {
      logger.debug("Extracted base64 image from content");
      return dataUri;
    }
  }

  return null;
}
