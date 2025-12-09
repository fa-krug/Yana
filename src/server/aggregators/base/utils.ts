/**
 * Utility functions for aggregators.
 */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import sharp from "sharp";
import axios from "axios";
import { logger } from "../../utils/logger";

// Image compression settings
const MAX_IMAGE_WIDTH = 600;
const MAX_IMAGE_HEIGHT = 600;
// Higher resolution for header images
export const MAX_HEADER_IMAGE_WIDTH = 1200;
export const MAX_HEADER_IMAGE_HEIGHT = 1200;
const JPEG_QUALITY = 65;
const WEBP_QUALITY = 65;
const PREFER_WEBP = true;

/**
 * Extract YouTube video ID from URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    let videoId: string | null = null;

    // Handle youtu.be short URLs
    if (
      parsedUrl.hostname === "youtu.be" ||
      parsedUrl.hostname === "www.youtu.be"
    ) {
      videoId = parsedUrl.pathname.slice(1).split("?")[0].split("&")[0];
    }
    // Handle youtube.com URLs
    else if (
      parsedUrl.hostname === "youtube.com" ||
      parsedUrl.hostname === "www.youtube.com" ||
      parsedUrl.hostname === "m.youtube.com"
    ) {
      // /watch?v=VIDEO_ID
      if (parsedUrl.pathname === "/watch" || parsedUrl.pathname === "/watch/") {
        videoId = parsedUrl.searchParams.get("v");
      }
      // /embed/VIDEO_ID or /v/VIDEO_ID or /shorts/VIDEO_ID
      else if (
        parsedUrl.pathname.startsWith("/embed/") ||
        parsedUrl.pathname.startsWith("/v/") ||
        parsedUrl.pathname.startsWith("/shorts/")
      ) {
        const parts = parsedUrl.pathname.split("/");
        if (parts.length > 2) {
          videoId = parts[2].split("?")[0];
        }
      }
    }

    // Validate video ID format (typically 11 characters, alphanumeric with - and _)
    if (videoId && /^[\w-]+$/.test(videoId)) {
      return videoId;
    }

    return null;
  } catch (error) {
    logger.debug({ error, url }, "Failed to extract YouTube video ID");
    return null;
  }
}

/**
 * Convert Reddit preview.redd.it URLs to i.redd.it URLs when possible.
 * Reddit's i.redd.it CDN is more accessible than preview.redd.it.
 */
function convertRedditPreviewUrl(url: string): string {
  try {
    // Convert preview.redd.it to i.redd.it
    if (url.includes("preview.redd.it")) {
      const urlObj = new URL(url);
      // Extract the filename from the path
      const pathParts = urlObj.pathname.split("/");
      const filename = pathParts[pathParts.length - 1];

      // Build i.redd.it URL (remove query params as they're often signatures)
      const newUrl = `https://i.redd.it/${filename}`;
      logger.debug(
        { original: url, converted: newUrl },
        "Converting Reddit preview URL",
      );
      return newUrl;
    }
    return url;
  } catch (error) {
    logger.debug({ error, url }, "Failed to convert Reddit preview URL");
    return url;
  }
}

/**
 * Get appropriate referer header for a URL.
 * For Reddit URLs, use reddit.com. For others, use the domain of the URL.
 */
function getRefererHeader(url: string): string {
  try {
    const urlObj = new URL(url);

    // Special handling for Reddit domains
    if (
      urlObj.hostname.includes("redd.it") ||
      urlObj.hostname.includes("reddit.com")
    ) {
      return "https://www.reddit.com";
    }

    // For other domains, use the origin
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    logger.debug({ error, url }, "Failed to determine referer");
    return "https://www.reddit.com"; // Safe fallback
  }
}

/**
 * Fetch a single image from URL with validation.
 */
async function fetchSingleImage(url: string): Promise<{
  url: string;
  imageData: Buffer | null;
  contentType: string | null;
}> {
  try {
    // Try converting Reddit preview URLs first
    let imageUrl = convertRedditPreviewUrl(url);
    const referer = getRefererHeader(imageUrl);

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
    };

    let response;
    try {
      response = await axios.get(imageUrl, {
        headers,
        responseType: "arraybuffer",
        timeout: 10000,
        maxRedirects: 5,
      });
    } catch (error) {
      // If converted URL fails and original was different, try original
      if (
        imageUrl !== url &&
        axios.isAxiosError(error) &&
        error.response?.status === 403
      ) {
        logger.debug(
          { converted: imageUrl, original: url },
          "Converted URL failed, trying original",
        );
        imageUrl = url;
        const originalReferer = getRefererHeader(url);
        response = await axios.get(imageUrl, {
          headers: {
            ...headers,
            Referer: originalReferer,
          },
          responseType: "arraybuffer",
          timeout: 10000,
          maxRedirects: 5,
        });
      } else {
        throw error;
      }
    }

    // Determine MIME type
    let contentType = response.headers["content-type"] || "";
    if (!contentType || contentType === "application/octet-stream") {
      // Try to guess from URL
      const urlLower = url.toLowerCase();
      if (urlLower.endsWith(".jpg") || urlLower.endsWith(".jpeg")) {
        contentType = "image/jpeg";
      } else if (urlLower.endsWith(".png")) {
        contentType = "image/png";
      } else if (urlLower.endsWith(".gif")) {
        contentType = "image/gif";
      } else if (urlLower.endsWith(".webp")) {
        contentType = "image/webp";
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

    // Additional validation: Try to parse as image with sharp
    try {
      const imageBuffer = Buffer.from(response.data);
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

/**
 * Extract image dimensions from HTML attributes and CSS styles.
 * Returns { width, height } if both are found, null otherwise.
 */
function extractImageDimensions(
  $: cheerio.CheerioAPI,
  el: Element,
): { width: number; height: number } | null {
  // First try HTML attributes
  const widthAttr = $(el).attr("width");
  const heightAttr = $(el).attr("height");
  if (widthAttr && heightAttr) {
    const w = parseInt(widthAttr, 10);
    const h = parseInt(heightAttr, 10);
    if (!isNaN(w) && !isNaN(h)) {
      return { width: w, height: h };
    }
  }

  // Fall back to CSS styles
  const style = $(el).attr("style");
  if (style) {
    const widthMatch = style.match(/width\s*:\s*(\d+)px/i);
    const heightMatch = style.match(/height\s*:\s*(\d+)px/i);
    if (widthMatch && heightMatch) {
      const w = parseInt(widthMatch[1], 10);
      const h = parseInt(heightMatch[1], 10);
      if (!isNaN(w) && !isNaN(h)) {
        return { width: w, height: h };
      }
    }
  }

  return null;
}

/**
 * Extract an image from a URL using multiple strategies.
 */
export async function extractImageFromUrl(
  url: string,
  isHeaderImage: boolean = false,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  logger.debug({ url, isHeaderImage }, "Extracting image from URL");

  try {
    // Check if URL is an image directly
    const parsedUrl = new URL(url);
    const urlPath = parsedUrl.pathname.toLowerCase();

    if (
      [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].some((ext) =>
        urlPath.endsWith(ext),
      )
    ) {
      logger.debug({ url }, "URL is an image file");
      const result = await fetchSingleImage(url);
      if (result.imageData && result.imageData.length > 5000) {
        // Check dimensions to ensure it's not too small
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
    }

    // Special handling for YouTube URLs
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

    // Fetch the page to extract meta tags and images
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
      const result = await fetchSingleImage(imageUrl);
      // Check if image is large enough (skip small images)
      if (result.imageData && result.imageData.length > 5000) {
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
                url: imageUrl,
              },
              "og:image too small, skipping",
            );
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
    }

    // Strategy 2: Try twitter:image meta tag
    const twitterImage = $('meta[name="twitter:image"]').attr("content");
    if (twitterImage) {
      const imageUrl = new URL(twitterImage, url).toString();
      logger.debug({ imageUrl }, "Found twitter:image");
      const result = await fetchSingleImage(imageUrl);
      // Check if image is large enough (skip small images)
      if (result.imageData && result.imageData.length > 5000) {
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
                url: imageUrl,
              },
              "twitter:image too small, skipping",
            );
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
    }

    // Strategy 3: Find meaningful images on the page
    const candidateImages: string[] = [];
    $("img").each((_, el) => {
      const imgSrc =
        $(el).attr("src") ||
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src");
      if (!imgSrc) return;

      // Skip small images (likely icons/logos) - always check size
      // Small images should only be used as thumbnails, not as header images
      // Check both HTML attributes and CSS styles
      const dimensions = extractImageDimensions($, el);
      if (dimensions) {
        if (dimensions.width < 100 || dimensions.height < 100) {
          logger.debug(
            {
              width: dimensions.width,
              height: dimensions.height,
              src: imgSrc,
              isHeaderImage,
            },
            "Skipping small image (will be used as thumbnail only)",
          );
          return;
        }
      }

      const imageUrl = new URL(imgSrc, url).toString();
      candidateImages.push(imageUrl);
    });

    // Try up to 5 candidate images
    for (let idx = 0; idx < Math.min(candidateImages.length, 5); idx++) {
      const imageUrl = candidateImages[idx];
      logger.debug({ imageUrl, attempt: idx + 1 }, "Trying content image");
      const result = await fetchSingleImage(imageUrl);
      if (result.imageData && result.imageData.length > 5000) {
        logger.debug({ attempt: idx + 1 }, "Successfully found valid image");
        return {
          imageData: result.imageData,
          contentType: result.contentType || "image/jpeg",
        };
      } else if (result.imageData) {
        logger.debug(
          { size: result.imageData.length },
          "Image too small, trying next candidate",
        );
      }
    }

    return null;
  } catch (error) {
    logger.warn({ error, url }, "Failed to extract image from URL");
    return null;
  }
}

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
    // Special handling for YouTube URLs
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      // Try maxresdefault first (highest quality), fall back to hqdefault
      for (const quality of ["maxresdefault", "hqdefault"]) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
        try {
          const response = await axios.head(thumbnailUrl, { timeout: 5000 });
          if (response.status === 200) {
            logger.debug({ thumbnailUrl }, "Found YouTube thumbnail");
            return thumbnailUrl;
          }
        } catch (error) {
          // Try next quality
          continue;
        }
      }
    }

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

    if (needsResize) {
      const ratio = Math.min(
        maxWidth / metadata.width!,
        maxHeight / metadata.height!,
      );
      const newWidth = Math.round(metadata.width! * ratio);
      const newHeight = Math.round(metadata.height! * ratio);
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

/**
 * Remove HTML elements by CSS selectors.
 */
export function removeElementsBySelectors(
  html: string,
  selectors: string[] = [],
  removeEmpty: boolean = false,
): string {
  if (!selectors.length && !removeEmpty) {
    return html;
  }

  logger.debug(
    { selectorCount: selectors.length, removeEmpty },
    "Removing elements by selectors",
  );

  try {
    const $ = cheerio.load(html);
    let removedCount = 0;

    // Remove elements by selectors
    for (const selector of selectors) {
      try {
        const elements = $(selector);
        elements.remove();
        if (elements.length > 0) {
          removedCount += elements.length;
          logger.debug(
            { selector, count: elements.length },
            "Removed elements",
          );
        }
      } catch (error) {
        logger.warn(
          { error, selector },
          "Failed to remove elements with selector",
        );
      }
    }

    // Remove empty elements if requested
    if (removeEmpty) {
      let emptyCount = 0;
      $("p, div, span").each((_, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        const hasImages = $el.find("img").length > 0;
        if (!text && !hasImages) {
          $el.remove();
          emptyCount++;
        }
      });
      if (emptyCount > 0) {
        logger.debug({ count: emptyCount }, "Removed empty elements");
        removedCount += emptyCount;
      }
    }

    logger.debug({ totalRemoved: removedCount }, "Total elements removed");
    return $.html();
  } catch (error) {
    logger.error({ error }, "Error removing elements by selectors");
    return html;
  }
}

/**
 * Sanitize HTML content, removing scripts and renaming attributes.
 * This matches the Python version's behavior.
 */
export function sanitizeHtml(html: string): string {
  logger.debug("Sanitizing HTML content");

  try {
    const $ = cheerio.load(html);

    // Remove script and style elements
    $("script, style, iframe, object, embed").remove();

    // Rename class, style, id, and data attributes to disable original styling/behavior
    $("*").each((_, el) => {
      const $el = $(el);

      // Rename class attribute
      const classAttr = $el.attr("class");
      if (classAttr) {
        $el.attr("data-sanitized-class", classAttr);
        $el.removeAttr("class");
      }

      // Rename inline styles
      const styleAttr = $el.attr("style");
      if (styleAttr) {
        $el.attr("data-sanitized-style", styleAttr);
        $el.removeAttr("style");
      }

      // Rename id attribute
      const idAttr = $el.attr("id");
      if (idAttr) {
        $el.attr("data-sanitized-id", idAttr);
        $el.removeAttr("id");
      }

      // Rename data-* attributes (except data-src and data-srcset which are needed for images)
      // Check if element is an Element type (has attribs property)
      if ("attribs" in el && el.attribs) {
        const attrs = el.attribs;
        for (const attr of Object.keys(attrs)) {
          if (
            attr.startsWith("data-") &&
            attr !== "data-src" &&
            attr !== "data-srcset" &&
            !attr.startsWith("data-sanitized-")
          ) {
            $el.attr(`data-sanitized-${attr}`, attrs[attr]);
            $el.removeAttr(attr);
          }
        }
      }
    });

    const sanitized = $.html();
    logger.debug({ length: sanitized.length }, "HTML sanitized");
    return sanitized;
  } catch (error) {
    logger.error({ error }, "Error sanitizing HTML");
    return html;
  }
}

/**
 * Check if article should be skipped.
 */
export function shouldSkipArticle(
  title: string,
  skipDuplicates: boolean,
  existingTitles: Set<string>,
): boolean {
  if (!skipDuplicates) return false;

  const normalizedTitle = title.toLowerCase().trim();
  return existingTitles.has(normalizedTitle);
}

/**
 * Check if an article should be skipped during aggregation.
 *
 * Consolidates common skip logic:
 * 1. Skip if URL already exists (unless forceRefresh)
 * 2. Skip if article with same name exists in last 2 weeks (unless forceRefresh)
 *
 * @param article - The article to check
 * @param forceRefresh - If true, don't skip existing articles
 * @returns Object with shouldSkip boolean and optional reason string
 */
export async function shouldSkipArticleByDuplicate(
  article: { url: string; title: string },
  forceRefresh: boolean,
): Promise<{ shouldSkip: boolean; reason: string | null }> {
  // Import here to avoid circular dependency
  const { db, articles } = await import("../../db");
  const { eq, and, gte } = await import("drizzle-orm");

  // If forcing refresh, don't skip
  if (forceRefresh) {
    return { shouldSkip: false, reason: null };
  }

  // Check 1: URL already exists (globally, not just in current feed)
  const [existingByUrl] = await db
    .select()
    .from(articles)
    .where(eq(articles.url, article.url))
    .limit(1);

  if (existingByUrl) {
    return { shouldSkip: true, reason: null }; // Don't log for existing articles (too verbose)
  }

  // Check 2: Article with same name exists in last 2 weeks
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const [existingByName] = await db
    .select()
    .from(articles)
    .where(
      and(eq(articles.name, article.title), gte(articles.date, twoWeeksAgo)),
    )
    .limit(1);

  if (existingByName) {
    return {
      shouldSkip: true,
      reason: `Article with same name exists in last 2 weeks: ${article.title}`,
    };
  }

  // Don't skip
  return { shouldSkip: false, reason: null };
}
