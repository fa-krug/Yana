/**
 * Page image extraction strategy.
 */

import * as cheerio from "cheerio";
import sharp from "sharp";

import {
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "@server/aggregators/base/utils/compression";
import { logger } from "@server/utils/logger";

import { extractImageDimensions } from "../dimensions";
import { fetchSingleImage } from "../fetch";

const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;

/**
 * Check if image URL is SVG format.
 */
function isSvgImage(src: string): boolean {
  return src.toLowerCase().endsWith(".svg");
}

/**
 * Check if element should be processed based on size.
 */
function shouldProcessImage(
  el: cheerio.Element,
  $: cheerio.CheerioAPI,
): boolean {
  const dimensions = extractImageDimensions($, el);
  // Process if no dimensions available or if dimensions are large enough
  return !dimensions || (dimensions.width >= 100 && dimensions.height >= 100);
}

/**
 * Extract image source from element attributes.
 */
function extractImageSrc(
  el: cheerio.Element,
  $: cheerio.CheerioAPI,
): string | null {
  return (
    $(el).attr("src") ||
    $(el).attr("data-src") ||
    $(el).attr("data-lazy-src") ||
    null
  );
}

/**
 * Process SVG image: fetch, convert to PNG, and resize.
 */
async function processSvgImage(
  imageUrl: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  logger.debug({ imageUrl }, "Found SVG image file, converting to PNG");

  const result = await fetchSingleImage(imageUrl);
  if (!result.imageData || result.imageData.length < 1000) {
    logger.debug({ size: result.imageData?.length }, "SVG too small");
    return null;
  }

  try {
    const targetSize = isHeaderImage
      ? { width: MAX_HEADER_IMAGE_WIDTH, height: MAX_HEADER_IMAGE_HEIGHT }
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
      "Successfully converted SVG to PNG",
    );
    return {
      imageData: converted,
      contentType: "image/png",
    };
  } catch (error) {
    logger.warn({ error, url: imageUrl }, "Failed to convert SVG");
    return null;
  }
}

/**
 * Process standard image: fetch and validate dimensions if needed.
 */
async function processStandardImage(
  imageUrl: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  logger.debug(
    { imageUrl: imageUrl.slice(0, 50) },
    "No SVG found, trying first large image",
  );

  const result = await fetchSingleImage(imageUrl);
  if (!result.imageData || result.imageData.length < 5000) {
    return null;
  }

  // For header images, validate actual dimensions
  if (isHeaderImage) {
    try {
      const img = sharp(result.imageData);
      const metadata = await img.metadata();
      if (
        metadata.width &&
        metadata.height &&
        metadata.width >= 200 &&
        metadata.height >= 200
      ) {
        logger.debug(
          {
            width: metadata.width,
            height: metadata.height,
            size: result.imageData.length,
          },
          "Successfully found valid header image",
        );
        return buildImageResult(result.imageData, result.contentType);
      } else {
        logger.debug(
          {
            width: metadata.width,
            height: metadata.height,
            size: result.imageData.length,
          },
          "Header image too small",
        );
        return null;
      }
    } catch {
      // If we can't check dimensions, use file size check only
      logger.debug(
        { size: result.imageData.length },
        "Successfully found valid image",
      );
      return buildImageResult(result.imageData, result.contentType);
    }
  } else {
    logger.debug(
      { size: result.imageData.length },
      "Successfully found valid image",
    );
    return buildImageResult(result.imageData, result.contentType);
  }
}

/**
 * Build standardized image result object.
 */
function buildImageResult(
  imageData: Buffer,
  contentType: string | null | undefined,
): { imageData: Buffer; contentType: string } {
  return {
    imageData,
    contentType: contentType || "image/jpeg",
  };
}

/**
 * Handle image extraction from page images.
 */
export async function handlePageImages(
  $: cheerio.CheerioAPI,
  url: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  const images = $("img");
  let firstLargeImageUrl: string | null = null;

  // First pass: Look for SVG images
  for (let idx = 0; idx < images.length; idx++) {
    const el = images[idx];
    const imgSrc = extractImageSrc(el, $);
    if (!imgSrc) continue;

    if (isSvgImage(imgSrc)) {
      const imageUrl = new URL(imgSrc, url).toString();
      const result = await processSvgImage(imageUrl, isHeaderImage);
      if (result) return result;
      continue;
    }

    // Track first large non-SVG image for fallback
    if (!firstLargeImageUrl && shouldProcessImage(el, $)) {
      firstLargeImageUrl = new URL(imgSrc, url).toString();
    }
  }

  // Second pass: Use first large image if no SVG found
  if (firstLargeImageUrl) {
    return await processStandardImage(firstLargeImageUrl, isHeaderImage);
  }

  return null;
}
