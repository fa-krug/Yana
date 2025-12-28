/**
 * Basic image extraction strategies (direct URLs, YouTube, Twitter, meta tags).
 */

import axios from "axios";
import sharp from "sharp";

import {
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "@server/aggregators/base/utils/compression";
import {
  isTwitterUrl,
  extractTweetId,
} from "@server/aggregators/base/utils/twitter";
import { extractYouTubeVideoId } from "@server/aggregators/base/utils/youtube";
import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../../../exceptions";
import { is4xxError } from "../../http-errors";
import { fetchSingleImage } from "../fetch";

const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;

interface FxTwitterMedia {
  photos?: Array<{ url: string }>;
  all?: Array<{ type: string; url: string }>;
}

interface FxTwitterResponse {
  tweet?: {
    media?: FxTwitterMedia;
  };
}

/**
 * Handle direct image URL extraction.
 */
export async function handleDirectImageUrl(
  url: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  const result = await fetchSingleImage(url);
  if (result.imageData && result.imageData.length > 4000) {
    const urlPath = new URL(url).pathname.toLowerCase();
    const isSvg =
      result.contentType === "image/svg+xml" || urlPath.endsWith(".svg");

    // For SVGs, convert to larger raster format (skip dimension checks)
    if (isSvg) {
      try {
        const targetSize = isHeaderImage
          ? {
              width: MAX_HEADER_IMAGE_WIDTH,
              height: MAX_HEADER_IMAGE_HEIGHT,
            }
          : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };
        const converted = await sharp(result.imageData)
          .resize(targetSize.width, targetSize.height, {
            fit: "inside",
            withoutEnlargement: false,
          })
          .png()
          .toBuffer();
        logger.debug(
          {
            originalSize: result.imageData.length,
            convertedSize: converted.length,
          },
          "Converted SVG to PNG",
        );
        return {
          imageData: converted,
          contentType: "image/png",
        };
      } catch (error) {
        logger.warn({ error, url }, "Failed to convert SVG");
        return null;
      }
    }

    // For non-SVG images, check dimensions to ensure it's not too small
    try {
      const img = sharp(result.imageData);
      const metadata = await img.metadata();
      if (
        metadata.width &&
        metadata.height &&
        (metadata.width < 100 || metadata.height < 50)
      ) {
        logger.debug(
          {
            width: metadata.width,
            height: metadata.height,
            url,
          },
          "Direct image URL too small, skipping",
        );
        return null;
      }
      return {
        imageData: result.imageData,
        contentType: result.contentType || "image/jpeg",
      };
    } catch {
      // If we can't check dimensions, use file size check only
      return {
        imageData: result.imageData,
        contentType: result.contentType || "image/jpeg",
      };
    }
  }
  return null;
}

/**
 * Handle YouTube thumbnail extraction.
 */
export async function handleYouTubeThumbnail(
  url: string,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    logger.debug({ videoId }, "YouTube video detected, extracting thumbnail");
    // Try maxresdefault first (highest quality), fall back to hqdefault
    for (const quality of ["maxresdefault", "hqdefault"]) {
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
      logger.debug({ thumbnailUrl }, "Trying YouTube thumbnail");
      const result = await fetchSingleImage(thumbnailUrl);
      if (result.imageData && result.imageData.length > 1000) {
        return {
          imageData: result.imageData,
          contentType: result.contentType || "image/jpeg",
        };
      }
    }
  }
  return null;
}

/**
 * Validate Twitter URL and extract tweet ID.
 * Returns tweet ID if valid, null otherwise.
 */
function validateTwitterUrl(url: string): string | null {
  if (!isTwitterUrl(url)) {
    return null;
  }

  logger.debug({ url }, "X.com/Twitter URL detected");
  const tweetId = extractTweetId(url);

  if (!tweetId) {
    logger.debug({ url }, "Could not extract tweet ID from URL");
    return null;
  }

  logger.debug({ tweetId }, "Extracted tweet ID");
  return tweetId;
}

/**
 * Extract photo URLs from tweet.media.photos array.
 */
function extractPhotosFromMediaPhotos(data: FxTwitterResponse): string[] {
  const photos = data?.tweet?.media?.photos;

  if (!photos || !Array.isArray(photos)) {
    return [];
  }

  const urls: string[] = [];
  for (const photo of photos) {
    if (photo?.url) {
      urls.push(photo.url);
    }
  }

  if (urls.length > 0) {
    logger.debug({ count: urls.length }, "Found photos in tweet.media.photos");
  }

  return urls;
}

/**
 * Extract photo URLs from tweet.media.all array (fallback).
 */
function extractPhotosFromMediaAll(data: FxTwitterResponse): string[] {
  const allMedia = data?.tweet?.media?.all;

  if (!allMedia || !Array.isArray(allMedia)) {
    return [];
  }

  const urls: string[] = [];
  for (const media of allMedia) {
    if (media?.type === "photo" && media?.url) {
      urls.push(media.url);
    }
  }

  if (urls.length > 0) {
    logger.debug({ count: urls.length }, "Found photos in tweet.media.all");
  }

  return urls;
}

/**
 * Extract all photo URLs from tweet data.
 * Tries tweet.media.photos first, falls back to tweet.media.all.
 */
function extractImageUrlsFromTweetData(data: FxTwitterResponse, tweetId: string): string[] {
  // Try primary location first
  let imageUrls = extractPhotosFromMediaPhotos(data);

  // Fallback to media.all if no photos found
  if (imageUrls.length === 0) {
    imageUrls = extractPhotosFromMediaAll(data);
  }

  if (imageUrls.length === 0) {
    logger.warn({ tweetId }, "No images found in fxtwitter API response");
  }

  return imageUrls;
}

/**
 * Fetch tweet data from fxtwitter API.
 * Throws ArticleSkipError on 4xx errors.
 */
async function fetchTweetData(tweetId: string): Promise<FxTwitterResponse> {
  const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;
  logger.debug({ apiUrl }, "Fetching tweet data from fxtwitter API");

  try {
    const response = await axios.get(apiUrl, { timeout: 10000 });
    return response.data;
  } catch (error) {
    // Check for 4xx errors - skip article on client errors
    const statusCode = is4xxError(error);
    if (statusCode !== null) {
      logger.warn(
        { error, tweetId, statusCode },
        "4xx error fetching Twitter data",
      );
      throw new ArticleSkipError(
        `Failed to fetch tweet data: ${statusCode}`,
        undefined,
        statusCode,
        error instanceof Error ? error : undefined,
      );
    }
    // Re-throw for caller to handle
    throw error;
  }
}

/**
 * Download Twitter image from URL.
 */
async function downloadTwitterImage(
  imageUrl: string,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  logger.debug({ imageUrl }, "Downloading X.com image");
  const result = await fetchSingleImage(imageUrl);

  if (!result.imageData) {
    return null;
  }

  return {
    imageData: result.imageData,
    contentType: result.contentType || "image/jpeg",
  };
}

/**
 * Handle X.com/Twitter image extraction.
 */
export async function handleTwitterImage(
  url: string,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  // Validate URL and extract tweet ID
  const tweetId = validateTwitterUrl(url);
  if (!tweetId) {
    return null;
  }

  try {
    // Fetch tweet data from API
    const data = await fetchTweetData(tweetId);

    // Extract image URLs from tweet data
    const imageUrls = extractImageUrlsFromTweetData(data, tweetId);
    if (imageUrls.length === 0) {
      return null;
    }

    // Download first image
    return await downloadTwitterImage(imageUrls[0]);
  } catch (error) {
    // ArticleSkipError already thrown by fetchTweetData for 4xx
    if (error instanceof ArticleSkipError) {
      throw error;
    }

    // Other errors: log and return null
    logger.warn(
      { error, url },
      "Failed to extract X.com image via fxtwitter API",
    );
    return null;
  }
}

/**
 * Convert SVG to PNG.
 */
async function convertSvgToPng(imageData: Buffer, isHeaderImage: boolean): Promise<Buffer | null> {
  try {
    const targetSize = isHeaderImage
      ? { width: MAX_HEADER_IMAGE_WIDTH, height: MAX_HEADER_IMAGE_HEIGHT }
      : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };
    return await sharp(imageData).resize(targetSize.width, targetSize.height, { fit: "inside", withoutEnlargement: false }).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * Handle meta tag image extraction (og:image, twitter:image).
 */
export async function handleMetaTagImage(
  imageUrl: string,
  baseUrl: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  const fullImageUrl = new URL(imageUrl, baseUrl).toString();
  const result = await fetchSingleImage(fullImageUrl);
  if (!result.imageData || result.imageData.length <= 5000) return null;

  if (result.contentType === "image/svg+xml" || fullImageUrl.toLowerCase().endsWith(".svg")) {
    const converted = await convertSvgToPng(result.imageData, isHeaderImage);
    return converted ? { imageData: converted, contentType: "image/png" } : null;
  }

  try {
    const metadata = await sharp(result.imageData).metadata();
    if (metadata.width && metadata.height && (metadata.width < 100 || metadata.height < 100)) {
      return null;
    }
  } catch { /* Use file size check only */ }

  return { imageData: result.imageData, contentType: result.contentType || "image/jpeg" };
}
