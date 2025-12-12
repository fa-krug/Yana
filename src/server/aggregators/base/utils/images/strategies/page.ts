/**
 * Page image extraction strategy.
 */

import * as cheerio from "cheerio";
import sharp from "sharp";
import { logger } from "@server/utils/logger";
import {
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "@server/aggregators/base/utils/compression";
import { fetchSingleImage } from "../fetch";
import { extractImageDimensions } from "../dimensions";

const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;

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

  for (let idx = 0; idx < images.length; idx++) {
    const el = images[idx];
    const imgSrc =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src");
    if (!imgSrc) continue;

    const isSvg = imgSrc.toLowerCase().endsWith(".svg");
    if (!isSvg) {
      // Track first large non-SVG image for fallback
      if (!firstLargeImageUrl) {
        const dimensions = extractImageDimensions($, el);
        if (
          !dimensions ||
          (dimensions.width >= 100 && dimensions.height >= 100)
        ) {
          firstLargeImageUrl = new URL(imgSrc, url).toString();
        }
      }
      continue;
    }

    // Found SVG image file - fetch and convert it
    const imageUrl = new URL(imgSrc, url).toString();
    logger.debug({ imageUrl }, "Found SVG image file, converting to PNG");

    const result = await fetchSingleImage(imageUrl);
    if (!result.imageData || result.imageData.length < 1000) {
      logger.debug({ size: result.imageData?.length }, "SVG too small");
      continue;
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
      continue;
    }
  }

  // Second pass: if no SVG found, use first large image
  if (firstLargeImageUrl) {
    logger.debug(
      { imageUrl: firstLargeImageUrl.slice(0, 50) },
      "No SVG found, trying first large image",
    );
    const result = await fetchSingleImage(firstLargeImageUrl);
    if (result.imageData && result.imageData.length > 5000) {
      // For header images, check actual dimensions
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
            return {
              imageData: result.imageData,
              contentType: result.contentType || "image/jpeg",
            };
          } else {
            logger.debug(
              {
                width: metadata.width,
                height: metadata.height,
                size: result.imageData.length,
              },
              "Header image too small",
            );
          }
        } catch (error) {
          // If we can't check dimensions, use file size check only
          logger.debug(
            { size: result.imageData.length },
            "Successfully found valid image",
          );
          return {
            imageData: result.imageData,
            contentType: result.contentType || "image/jpeg",
          };
        }
      } else {
        logger.debug(
          { size: result.imageData.length },
          "Successfully found valid image",
        );
        return {
          imageData: result.imageData,
          contentType: result.contentType || "image/jpeg",
        };
      }
    }
  }
  return null;
}
