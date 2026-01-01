/**
 * Image compression utilities.
 */

import sharp from "sharp";

import { logger } from "@server/utils/logger";

// Image compression settings
const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;
const JPEG_QUALITY = 65;
const WEBP_QUALITY = 65;
const PREFER_WEBP = true;

export const MAX_HEADER_IMAGE_WIDTH = 1200;
export const MAX_HEADER_IMAGE_HEIGHT = 1200;

/**
 * Compress and resize an image to reduce its size.
 */
export async function compressImage(
  imageData: Buffer,
  contentType: string,
  maxWidth: number = MAX_IMAGE_WIDTH,
  maxHeight: number = MAX_IMAGE_HEIGHT,
  useWebp: boolean = PREFER_WEBP,
): Promise<{ imageData: Buffer; contentType: string }> {
  try {
    // Skip very small images
    if (imageData.length < 5000) {
      return { imageData, contentType };
    }

    let img = sharp(imageData);
    const metadata = await img.metadata();

    // Skip if already small enough and in WebP format
    if (
      metadata.width &&
      metadata.height &&
      metadata.width <= maxWidth &&
      metadata.height <= maxHeight &&
      contentType === "image/webp" &&
      imageData.length < 50000
    ) {
      return { imageData, contentType };
    }

    // Never resize images that are smaller than max dimensions
    // Only resize if image is larger than max dimensions (downsize only)
    const needsResize =
      metadata.width &&
      metadata.height &&
      (metadata.width > maxWidth || metadata.height > maxHeight);

    if (needsResize && metadata.width && metadata.height) {
      const ratio = Math.min(
        maxWidth / metadata.width,
        maxHeight / metadata.height,
      );
      const newWidth = Math.round(metadata.width * ratio);
      const newHeight = Math.round(metadata.height * ratio);
      img = img.resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3,
      });
      logger.debug(
        {
          original: `${metadata.width}x${metadata.height}`,
          new: `${newWidth}x${newHeight}`,
        },
        "Resized image (downsized)",
      );
    } else if (metadata.width && metadata.height) {
      // Image is smaller than max dimensions - preserve original size
      // Don't resize, just process for format conversion if needed
      logger.debug(
        {
          width: metadata.width,
          height: metadata.height,
          maxWidth,
          maxHeight,
        },
        "Image smaller than max dimensions, preserving original size",
      );
    }

    // Determine output format
    let outputBuffer: Buffer;
    let outputType: string;

    if (useWebp) {
      outputBuffer = await img
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer();
      outputType = "image/webp";
    } else if (metadata.hasAlpha) {
      // Keep PNG for images with transparency
      outputBuffer = await img.png({ compressionLevel: 9 }).toBuffer();
      outputType = "image/png";
    } else {
      // Convert to JPEG
      outputBuffer = await img
        .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
        .toBuffer();
      outputType = "image/jpeg";
    }

    const compressionRatio = outputBuffer.length / imageData.length;
    logger.debug(
      {
        original: imageData.length,
        compressed: outputBuffer.length,
        ratio: compressionRatio,
        type: outputType,
      },
      "Compressed image",
    );

    return { imageData: outputBuffer, contentType: outputType };
  } catch (error) {
    logger.warn({ error }, "Failed to compress image");
    return { imageData, contentType };
  }
}
