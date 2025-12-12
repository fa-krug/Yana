/**
 * Basic image extraction strategies (direct URLs, YouTube, Twitter, meta tags).
 */

import sharp from "sharp";
import axios from "axios";
import { logger } from "@server/utils/logger";
import { extractYouTubeVideoId } from "@server/aggregators/base/utils/youtube";
import {
  isTwitterUrl,
  extractTweetId,
} from "@server/aggregators/base/utils/twitter";
import {
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "@server/aggregators/base/utils/compression";
import { fetchSingleImage } from "../fetch";

const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;

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
    } catch (error) {
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
 * Handle X.com/Twitter image extraction.
 */
export async function handleTwitterImage(
  url: string,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  if (!isTwitterUrl(url)) {
    return null;
  }

  logger.debug({ url }, "X.com/Twitter URL detected");
  // Extract tweet ID from URL (e.g., /status/1234567890)
  const tweetId = extractTweetId(url);
  if (tweetId) {
    logger.debug({ tweetId }, "Extracted tweet ID");

    // Use fxtwitter.com API to get tweet media
    try {
      const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;
      logger.debug({ apiUrl }, "Fetching tweet data from fxtwitter API");

      const response = await axios.get(apiUrl, { timeout: 10000 });
      const data = response.data;

      // Try to extract images from the API response
      const imageUrls: string[] = [];

      // Check primary location: tweet.media.photos
      if (
        data?.tweet?.media?.photos &&
        Array.isArray(data.tweet.media.photos)
      ) {
        for (const photo of data.tweet.media.photos) {
          if (photo?.url) {
            imageUrls.push(photo.url);
          }
        }
        logger.debug(
          { count: imageUrls.length },
          "Found photos in tweet.media.photos",
        );
      }

      // Fallback: check tweet.media.all for photo type
      if (
        imageUrls.length === 0 &&
        data?.tweet?.media?.all &&
        Array.isArray(data.tweet.media.all)
      ) {
        for (const media of data.tweet.media.all) {
          if (media?.type === "photo" && media?.url) {
            imageUrls.push(media.url);
          }
        }
        logger.debug(
          { count: imageUrls.length },
          "Found photos in tweet.media.all",
        );
      }

      // Download the first image found
      if (imageUrls.length > 0) {
        const imageUrl = imageUrls[0];
        logger.debug({ imageUrl }, "Downloading X.com image");
        const result = await fetchSingleImage(imageUrl);
        if (result.imageData) {
          return {
            imageData: result.imageData,
            contentType: result.contentType || "image/jpeg",
          };
        }
      } else {
        logger.warn({ tweetId }, "No images found in fxtwitter API response");
      }
    } catch (error) {
      logger.warn(
        { error, url },
        "Failed to extract X.com image via fxtwitter API",
      );
    }
  } else {
    logger.debug({ url }, "Could not extract tweet ID from URL");
  }
  return null;
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
  logger.debug({ imageUrl: fullImageUrl }, "Found meta tag image");
  const result = await fetchSingleImage(fullImageUrl);
  // Check if image is large enough (skip small images)
  if (result.imageData && result.imageData.length > 5000) {
    const isSvg =
      result.contentType === "image/svg+xml" ||
      fullImageUrl.toLowerCase().endsWith(".svg");

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
        logger.debug({ url: fullImageUrl }, "Converted meta tag SVG to PNG");
        return {
          imageData: converted,
          contentType: "image/png",
        };
      } catch (error) {
        logger.warn(
          { error, url: fullImageUrl },
          "Failed to convert meta tag SVG",
        );
        return null;
      }
    }

    // Also check dimensions if we can get them
    try {
      const img = sharp(result.imageData);
      const metadata = await img.metadata();
      if (
        metadata.width &&
        metadata.height &&
        (metadata.width < 100 || metadata.height < 100)
      ) {
        logger.debug(
          {
            width: metadata.width,
            height: metadata.height,
            url: fullImageUrl,
          },
          "Meta tag image too small, skipping",
        );
        return null;
      } else {
        return {
          imageData: result.imageData,
          contentType: result.contentType || "image/jpeg",
        };
      }
    } catch (error) {
      // If we can't check dimensions, use file size check only
      return {
        imageData: result.imageData,
        contentType: result.contentType || "image/jpeg",
      };
    }
  }
  return null;
}
