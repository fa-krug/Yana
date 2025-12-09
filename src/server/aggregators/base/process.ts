/**
 * Content processing utilities.
 */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import sharp from "sharp";
import type { RawArticle } from "./types";
import {
  extractImageFromUrl,
  compressImage,
  extractYouTubeVideoId,
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
} from "./utils";
import { logger } from "../../utils/logger";

/**
 * Get YouTube proxy URL for embedding.
 */
function getYouTubeProxyUrl(videoId: string): string {
  return `/api/youtube-proxy?v=${encodeURIComponent(videoId)}`;
}

/**
 * Standardize content format across all feeds.
 *
 * This function:
 * 1. Finds the first URL (link or image) in the content (if generate_title_image=true)
 * 2. Extracts an image from that URL (or uses meta tags, first image, or favicon)
 * 3. Compresses and inlines the image as base64
 * 4. Places the image at the top of the content
 * 5. Removes the original image tag if it was in the content
 * 6. Adds the content below the image
 * 7. Adds a source link at the bottom (float right) (if add_source_footer=true)
 */
export async function standardizeContentFormat(
  content: string,
  article: RawArticle,
  baseUrl?: string,
  generateTitleImage: boolean = true,
  addSourceFooter: boolean = true,
  headerImageUrl?: string,
): Promise<string> {
  if (!baseUrl) {
    baseUrl = article.url;
  }

  logger.debug({ url: article.url }, "Standardizing content format");

  try {
    const $ = cheerio.load(content);
    const contentParts: string[] = [];

    // Extract and add header image if enabled
    if (generateTitleImage) {
      // First, check if article.url is a YouTube video - embed it instead of extracting image
      const articleVideoId = extractYouTubeVideoId(article.url);
      if (articleVideoId) {
        const embedUrl = getYouTubeProxyUrl(articleVideoId);
        contentParts.push(
          `<div class="youtube-embed-container">` +
            `<iframe src="${embedUrl}" ` +
            `title="YouTube video player" ` +
            `frameborder="0" ` +
            `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
            `allowfullscreen></iframe>` +
            `</div>`,
        );
        logger.debug(
          { videoId: articleVideoId },
          "Added YouTube embed for video",
        );
        // Skip image extraction for YouTube videos
      } else {
        // Find the first URL (link or image)
        let firstUrl: string | null = null;
        let firstElement: cheerio.Cheerio<Element> | null = null;

        // First, check for YouTube links in content (they take priority over header images)
        const firstLink = $("a[href]").first();
        if (firstLink.length > 0) {
          const linkHref = firstLink.attr("href");
          if (linkHref) {
            const linkUrl = new URL(linkHref, baseUrl).toString();
            if (extractYouTubeVideoId(linkUrl)) {
              firstUrl = linkUrl;
              firstElement = firstLink;
              logger.debug({ url: firstUrl }, "Found YouTube link in content");
            }
          }
        }

        // If no YouTube link found, use pre-determined header image URL if provided
        let isUsingHeaderImage = false;
        if (!firstUrl && headerImageUrl) {
          // Resolve relative URLs to absolute URLs
          firstUrl = new URL(headerImageUrl, baseUrl).toString();
          isUsingHeaderImage = true;
          logger.debug({ url: firstUrl }, "Using pre-determined header image");
        } else if (!firstUrl) {
          // First, try to find an image
          const firstImg = $("img").first();
          if (firstImg.length > 0) {
            const imgSrc =
              firstImg.attr("src") ||
              firstImg.attr("data-src") ||
              firstImg.attr("data-lazy-src");
            if (imgSrc) {
              firstUrl = new URL(imgSrc, baseUrl).toString();
              firstElement = firstImg;
              logger.debug({ url: firstUrl }, "Found first image");
            }
          }

          // If no image, try to find first link
          if (!firstUrl && firstLink.length > 0) {
            const linkHref = firstLink.attr("href");
            if (linkHref) {
              // Skip invalid URLs (template literals, JavaScript code, etc.)
              if (
                linkHref.includes("${") ||
                linkHref.startsWith("javascript:") ||
                linkHref.startsWith("data:") ||
                linkHref.trim() === ""
              ) {
                logger.debug({ linkHref }, "Skipping invalid link URL");
              } else {
                try {
                  firstUrl = new URL(linkHref, baseUrl).toString();
                  // Additional validation: ensure URL is actually valid (not containing template syntax)
                  if (!firstUrl.includes("${") && !firstUrl.includes("%7B")) {
                    firstElement = firstLink;
                    logger.debug({ url: firstUrl }, "Found first link");
                  } else {
                    logger.debug(
                      { firstUrl },
                      "Skipping URL with template syntax",
                    );
                    firstUrl = null;
                  }
                } catch (error) {
                  logger.debug({ error, linkHref }, "Failed to parse link URL");
                }
              }
            }
          }

          // If still no URL, use the article URL itself
          if (!firstUrl) {
            firstUrl = article.url;
            logger.debug(
              { url: firstUrl },
              "No URL found in content, using article URL",
            );
          }
        }

        // Final validation: ensure firstUrl doesn't contain template syntax (including URL-encoded)
        if (
          firstUrl &&
          (firstUrl.includes("${") ||
            firstUrl.includes("%7B") ||
            firstUrl.includes("%24%7B"))
        ) {
          logger.debug(
            { firstUrl },
            "Skipping URL with template syntax, using article URL instead",
          );
          firstUrl = article.url;
        }

        // Check if URL is a YouTube video - embed it instead of extracting image
        const videoId = extractYouTubeVideoId(firstUrl);
        if (videoId) {
          const embedUrl = getYouTubeProxyUrl(videoId);
          contentParts.push(
            `<div class="youtube-embed-container">` +
              `<iframe src="${embedUrl}" ` +
              `title="YouTube video player" ` +
              `frameborder="0" ` +
              `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
              `allowfullscreen></iframe>` +
              `</div>`,
          );
          logger.debug({ videoId }, "Added YouTube embed for video");

          // Remove the original link/image from content
          if (firstElement && firstElement.length > 0) {
            const parent = firstElement.parent();
            firstElement.remove();
            // Remove empty parent containers recursively
            let currentParent = parent;
            while (currentParent.length > 0) {
              const tagName = currentParent.get(0)?.tagName?.toLowerCase();
              if (tagName === "body" || tagName === "html") {
                break;
              }
              const text = currentParent.text().trim();
              const hasChildren = currentParent.children().length > 0;
              if (!text && !hasChildren) {
                const nextParent = currentParent.parent();
                currentParent.remove();
                currentParent = nextParent;
              } else {
                break;
              }
            }
            logger.debug("Removed original YouTube link/image from content");
          }
        } else {
          // Extract image from the URL or data URI
          let imageResult: { imageData: Buffer; contentType: string } | null =
            null;

          // Check if the URL is already a data URI (base64 encoded)
          if (firstUrl.startsWith("data:")) {
            logger.debug("First image is already a data URI, extracting data");
            try {
              // Parse data URI: data:image/png;base64,iVBORw0KG...
              if (firstUrl.includes(";base64,")) {
                const [header, encoded] = firstUrl.split(";base64,", 2);
                let contentType = header.split(":")[1] || "image/jpeg";

                // CRITICAL: Validate that data URI is actually an image
                if (!contentType.startsWith("image/")) {
                  logger.warn(
                    { contentType },
                    "Data URI has non-image content type, skipping",
                  );
                } else {
                  const imageData = Buffer.from(encoded, "base64");

                  // Additional validation: Try to parse as image with sharp
                  try {
                    await sharp(imageData).metadata(); // This will throw if not a valid image
                    imageResult = { imageData, contentType };
                    logger.debug(
                      { contentType, size: imageData.length },
                      "Extracted valid data URI image",
                    );
                  } catch (error) {
                    logger.warn(
                      { error, contentType },
                      "Data URI claims to be image but failed validation",
                    );
                  }
                }
              }
            } catch (error) {
              logger.error({ error }, "Failed to parse data URI");
            }
          } else {
            // Extract image from regular URL
            // Final safety check: ensure URL is valid before attempting extraction
            if (
              firstUrl &&
              !firstUrl.includes("${") &&
              !firstUrl.includes("%7B") &&
              !firstUrl.includes("%24%7B") &&
              firstUrl.startsWith("http")
            ) {
              // If this is a header_image_url, pass flag to skip width/height filtering
              imageResult = await extractImageFromUrl(
                firstUrl,
                isUsingHeaderImage,
              );
            } else {
              logger.debug(
                { firstUrl },
                "Skipping image extraction for invalid URL",
              );
            }
            // Save thumbnail URL (will be converted to base64 by aggregation service)
            if (imageResult) {
              article.thumbnailUrl = firstUrl;
              logger.debug({ url: firstUrl }, "Saved thumbnail URL");
            }
          }

          // Add the header image if we found one
          if (imageResult) {
            const { imageData, contentType } = imageResult;

            // Compress the image with higher resolution for header images
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

            // Add image at the top
            contentParts.push(
              `<p><img src="${dataUri}" alt="Article image" style="max-width: 100%; height: auto;"></p>`,
            );
            logger.debug("Added header image to content");

            // Remove the original image from content if it was an img tag
            if (
              firstElement &&
              firstElement.length > 0 &&
              firstElement.get(0)?.tagName === "img"
            ) {
              const parent = firstElement.parent();
              firstElement.remove();
              // Remove empty parent containers recursively
              let currentParent = parent;
              while (currentParent.length > 0) {
                const tagName = currentParent.get(0)?.tagName?.toLowerCase();
                if (tagName === "body" || tagName === "html") {
                  break;
                }
                const text = currentParent.text().trim();
                const hasChildren = currentParent.children().length > 0;
                if (!text && !hasChildren) {
                  const nextParent = currentParent.parent();
                  currentParent.remove();
                  currentParent = nextParent;
                } else {
                  break;
                }
              }
              logger.debug("Removed original image from content");
            }
          }
        }
      }
    }

    // Add the remaining content
    contentParts.push($.html());

    // Add source link at the bottom (float right) if enabled
    if (addSourceFooter) {
      contentParts.push(
        `<a href="${article.url}" style="float: right;">Source</a>`,
      );
    }

    return contentParts.join("");
  } catch (error) {
    logger.error({ error }, "Error standardizing content format");
    // Fallback: add source link if enabled
    if (addSourceFooter) {
      return `${content}<a href="${article.url}" style="float: right;">Source</a>`;
    }
    return content;
  }
}

/**
 * Process and sanitize HTML content.
 */
export async function processContent(
  html: string,
  article: RawArticle,
  generateTitleImage: boolean = true,
  addSourceFooter: boolean = true,
  headerImageUrl?: string,
): Promise<string> {
  // Standardize format (add header image, source link)
  return await standardizeContentFormat(
    html,
    article,
    article.url,
    generateTitleImage,
    addSourceFooter,
    headerImageUrl,
  );
}
