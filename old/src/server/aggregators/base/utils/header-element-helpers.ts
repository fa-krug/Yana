/**
 * Shared utilities for header element creation.
 * Extracted from header-element.ts to eliminate code duplication.
 */

import {
  compressImage,
  MAX_HEADER_IMAGE_HEIGHT,
  MAX_HEADER_IMAGE_WIDTH,
} from "./compression";

/**
 * Compress image and convert to base64 data URI.
 * Shared utility for all image-based header element strategies.
 *
 * @param imageData - Raw image buffer
 * @param contentType - MIME type of the image
 * @returns Object containing data URI, size, and output content type
 */
export async function compressAndEncodeImage(
  imageData: Buffer,
  contentType: string,
): Promise<{ dataUri: string; size: number; outputType: string }> {
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

  return {
    dataUri,
    size: compressedData.length,
    outputType,
  };
}

/**
 * Create image HTML element with base64 data URI.
 *
 * @param dataUri - Base64 encoded data URI
 * @param alt - Alt text for the image
 * @returns HTML string with img element wrapped in paragraph
 */
export function createImageElement(dataUri: string, alt: string): string {
  return `<p><img src="${dataUri}" alt="${alt}" style="max-width: 100%; height: auto;"></p>`;
}
