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
  MAX_HEADER_IMAGE_WIDTH,
  MAX_HEADER_IMAGE_HEIGHT,
  extractYouTubeVideoId,
  getYouTubeProxyUrl,
  createHeaderElementFromUrl,
} from "./utils";
import { logger } from "@server/utils/logger";

/**
 * Standardize content format across all feeds.
 *
 * This function wraps content in semantic HTML structure:
 * <article>
 *   <header>...</header>
 *   <section>...main content...</section>
 *   <section>...comments...</section>
 *   <footer>...</footer>
 * </article>
 *
 * Steps:
 * 1. Checks if content is already wrapped in <article> tag
 * 2. Checks if <header> already exists
 * 3. If no header exists and generate_title_image=true:
 *    - Finds the first URL (link or image) in the content
 *    - Extracts an image from that URL (or uses meta tags, first image, or favicon)
 *    - Compresses and inlines the image as base64
 *    - Places the image in <header> tag
 *    - Removes the original image tag if it was in the content
 * 4. Wraps the remaining content in <section> tag (unless already in section)
 * 5. Checks if <footer> already exists
 * 6. If no footer exists and add_source_footer=true:
 *    - Adds a source link in <footer> tag
 *
 * This prevents duplicate headers and footers when aggregators add them manually.
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

    // Check if content is already wrapped in <article> tag
    const hasArticleWrapper = $("article").length > 0;

    // Extract content from article if it exists, otherwise use full content
    // If article exists, get its inner HTML; otherwise get body HTML
    let bodyContent: string;
    if (hasArticleWrapper) {
      bodyContent = $("article").html() || "";
    } else {
      // Get body content, or if no body, get root HTML
      const body = $("body");
      bodyContent = body.length > 0 ? body.html() || "" : $.html();
    }

    // Re-parse the body content to work with it
    const $body = cheerio.load(bodyContent);

    // Check if header already exists
    const hasExistingHeader = $body("header").length > 0;

    const contentParts: string[] = [];

    // Extract and add header image if enabled and not already present
    if (generateTitleImage && !hasExistingHeader) {
      // Find the first URL (link or image) from body content
      let firstUrl: string | null = null;
      let firstElement: cheerio.Cheerio<Element> | null = null;

      // Use pre-determined header image URL if provided (aggregator's best guess)
      // Otherwise, find first URL from content
      let isUsingHeaderImage = false;
      if (headerImageUrl) {
        // Resolve relative URLs to absolute URLs
        firstUrl = new URL(headerImageUrl, baseUrl).toString();
        isUsingHeaderImage = true;
        logger.debug(
          { url: firstUrl },
          "Using pre-determined header image URL",
        );

        // Find matching element in content to remove it later
        // This prevents duplicate images (one in header, one in content)
        // Helper function to normalize URLs for comparison (remove trailing slashes, fragments, etc.)
        const normalizeUrl = (url: string) =>
          url.replace(/\/$/, "").split("#")[0].split("?")[0];

        if (!firstElement) {
          // Try to find matching image element
          $body("img").each((_, element) => {
            if (firstElement) return; // Already found one
            const $img = $body(element);
            const imgSrc =
              $img.attr("src") ||
              $img.attr("data-src") ||
              $img.attr("data-lazy-src");
            if (imgSrc) {
              try {
                const resolvedImgSrc = new URL(imgSrc, baseUrl).toString();
                // Compare normalized URLs
                if (normalizeUrl(resolvedImgSrc) === normalizeUrl(firstUrl)) {
                  firstElement = $body(element);
                  logger.debug(
                    { url: resolvedImgSrc },
                    "Found matching image element in content",
                  );
                }
              } catch (error) {
                // Invalid URL, skip
              }
            }
          });

          // If no matching image, try to find matching link
          if (!firstElement) {
            $body("a[href]").each((_, element) => {
              if (firstElement) return; // Already found one
              const $link = $body(element);
              const linkHref = $link.attr("href");
              if (linkHref) {
                // Skip invalid URLs
                if (
                  linkHref.includes("${") ||
                  linkHref.startsWith("javascript:") ||
                  linkHref.startsWith("data:") ||
                  linkHref.trim() === ""
                ) {
                  return;
                }
                try {
                  const resolvedLinkHref = new URL(
                    linkHref,
                    baseUrl,
                  ).toString();
                  // Compare normalized URLs
                  if (
                    normalizeUrl(resolvedLinkHref) === normalizeUrl(firstUrl)
                  ) {
                    firstElement = $body(element);
                    logger.debug(
                      { url: resolvedLinkHref },
                      "Found matching link element in content",
                    );
                  }
                } catch (error) {
                  // Invalid URL, skip
                }
              }
            });
          }
        }
      } else if (!firstUrl) {
        // First, try to find an image
        const firstImg = $body("img").first();
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
        const firstLink = $body("a[href]").first();
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

      // Use the unified header element creation function
      // This handles YouTube embeds, image extraction, compression, and base64 encoding
      if (firstUrl) {
        // Final safety check: ensure URL is valid before attempting extraction
        if (
          !firstUrl.includes("${") &&
          !firstUrl.includes("%7B") &&
          !firstUrl.includes("%24%7B") &&
          (firstUrl.startsWith("http") || firstUrl.startsWith("data:"))
        ) {
          // Handle data URI separately (already base64 encoded)
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

                    // Add image in header
                    contentParts.push(
                      `<header><p><img src="${dataUri}" alt="Article image" style="max-width: 100%; height: auto;"></p></header>`,
                    );
                    logger.debug("Added compressed data URI image to content");
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
            // Use unified function for regular URLs (handles YouTube, Twitter, Reddit, images, etc.)
            const headerElement = await createHeaderElementFromUrl(
              firstUrl,
              "Article image",
            );

            if (headerElement) {
              // Wrap header element in <header> tag if not already wrapped
              let wrappedHeader: string;
              if (
                headerElement.includes("<header>") ||
                headerElement.includes("<header ")
              ) {
                wrappedHeader = headerElement;
              } else {
                // Remove any existing wrapper divs with data-article-header
                const cleaned = headerElement
                  .replace(/<div[^>]*data-article-header[^>]*>/gi, "")
                  .replace(/<\/div>/gi, "");
                wrappedHeader = `<header>${cleaned}</header>`;
              }
              contentParts.push(wrappedHeader);

              // Save thumbnail URL (will be converted to base64 by aggregation service)
              article.thumbnailUrl = firstUrl;
              logger.debug({ url: firstUrl }, "Saved thumbnail URL");

              // Check if it's a YouTube embed to handle duplicate removal
              const videoId = extractYouTubeVideoId(firstUrl);
              if (videoId && isUsingHeaderImage) {
                // Remove duplicate YouTube links from content
                $body("a[href]").each((_, element) => {
                  const href = $(element).attr("href");
                  if (href) {
                    try {
                      const linkVideoId = extractYouTubeVideoId(
                        new URL(href, baseUrl).toString(),
                      );
                      if (linkVideoId === videoId) {
                        const parent = $(element).parent();
                        $(element).remove();
                        // Remove empty parent containers recursively
                        let currentParent = parent;
                        while (currentParent.length > 0) {
                          const tagName = currentParent
                            .get(0)
                            ?.tagName?.toLowerCase();
                          if (tagName === "body" || tagName === "html") {
                            break;
                          }
                          const text = currentParent.text().trim();
                          const hasChildren =
                            currentParent.children().length > 0;
                          if (!text && !hasChildren) {
                            const nextParent = currentParent.parent();
                            currentParent.remove();
                            currentParent = nextParent;
                          } else {
                            break;
                          }
                        }
                        logger.debug(
                          "Removed duplicate YouTube link from content",
                        );
                      }
                    } catch (error) {
                      // Invalid URL, skip
                    }
                  }
                });

                // Remove first image from content if it exists (since we're using YouTube video instead)
                const firstImg = $body("img").first();
                if (firstImg.length > 0) {
                  const parent = firstImg.parent();
                  firstImg.remove();
                  // Remove empty parent containers recursively
                  let currentParent = parent;
                  while (currentParent.length > 0) {
                    const tagName = currentParent
                      .get(0)
                      ?.tagName?.toLowerCase();
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
                  logger.debug(
                    "Removed first image from content (using YouTube video instead)",
                  );
                }
              }

              // Remove the original link/image element if it was in the content
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
                logger.debug("Removed original link/image from content");
              }
            } else {
              logger.debug(
                { url: firstUrl },
                "Failed to create header element from URL",
              );
            }
          }
        } else {
          logger.debug(
            { firstUrl },
            "Skipping header element creation for invalid URL",
          );
        }
      }
    }

    // Check if footer already exists before removing anything
    const hasExistingFooter = $body("footer").length > 0;

    // Extract existing headers (they should be preserved as-is)
    // This is important for aggregators like Tagesschau that add custom media headers
    const existingHeaders: string[] = [];
    $body("header").each((_, el) => {
      const $header = $body(el);
      existingHeaders.push($header.toString());
    });

    // Extract comment sections (they should be preserved as-is)
    const commentSections: string[] = [];
    $body("section").each((_, el) => {
      const $section = $body(el);
      // Check if this section contains comments (has "Comments" in heading or text)
      const sectionText = $section.text().toLowerCase();
      const sectionHtml = $section.html() || "";
      // Preserve sections that contain "Comments" (case-insensitive) or have comment-like structure
      if (
        sectionText.includes("comment") ||
        sectionHtml.match(/<h[1-6][^>]*>.*[Cc]omment/i)
      ) {
        commentSections.push($section.toString());
      }
    });

    // Remove header, footer, and comment sections from body content
    $body("header").remove();
    $body("footer").remove();
    $body("section").remove();

    const bodyHtml = $body.html() || "";

    // Build the final structure
    // Prefer existing headers (from aggregators like Tagesschau) over newly generated ones
    const existingHeaderHtml = existingHeaders.join("");
    const newHeaderHtml =
      contentParts.find((part) => part.includes("<header>")) || "";
    // Use existing header if present, otherwise use newly generated header
    const headerHtml = existingHeaderHtml || newHeaderHtml;

    // Wrap main content in section tag (unless it's empty)
    const mainContentSection = bodyHtml.trim()
      ? `<section>${bodyHtml}</section>`
      : "";

    // Preserve comment sections
    const commentSectionsHtml = commentSections.join("");

    const footerHtml =
      addSourceFooter && !hasExistingFooter
        ? `<footer><a href="${article.url}" style="float: right;">Source</a></footer>`
        : "";

    // Wrap everything in <article> tag
    const articleContent = `<article>${headerHtml}${mainContentSection}${commentSectionsHtml}${footerHtml}</article>`;

    return articleContent;
  } catch (error) {
    logger.error({ error }, "Error standardizing content format");
    // Fallback: wrap in article tag with footer if enabled
    const $ = cheerio.load(content);
    const hasExistingFooter = $("footer").length > 0;

    let fallbackContent = content;
    if (addSourceFooter && !hasExistingFooter) {
      fallbackContent = `<article>${content}<footer><a href="${article.url}" style="float: right;">Source</a></footer></article>`;
    } else if (!$("article").length) {
      fallbackContent = `<article>${content}</article>`;
    }

    return fallbackContent;
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
