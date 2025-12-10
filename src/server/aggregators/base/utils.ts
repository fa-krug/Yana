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
 * Get YouTube proxy URL for embedding.
 * Uses BASE_URL from environment if set, otherwise defaults to frontend port (4200) in development
 * or backend port (3000) in production.
 */
export function getYouTubeProxyUrl(videoId: string): string {
  const baseUrl =
    process.env["BASE_URL"] ||
    (process.env["NODE_ENV"] === "development"
      ? "http://localhost:4200"
      : "http://localhost:3000");
  return `${baseUrl.replace(/\/$/, "")}/api/youtube-proxy?v=${encodeURIComponent(videoId)}`;
}

/**
 * Get appropriate referer header for a URL.
 * Uses the origin of the URL as referer.
 */
function getRefererHeader(url: string): string {
  try {
    const urlObj = new URL(url);
    // Use the origin as referer
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    logger.debug({ error, url }, "Failed to determine referer");
    // Safe fallback
    return "https://example.com";
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
    const referer = getRefererHeader(url);

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
    };

    const response = await axios.get(url, {
      headers,
      responseType: "arraybuffer",
      timeout: 10000,
      maxRedirects: 5,
    });

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

    // Special handling for X.com/Twitter URLs
    if (
      parsedUrl.hostname === "x.com" ||
      parsedUrl.hostname === "www.x.com" ||
      parsedUrl.hostname === "twitter.com" ||
      parsedUrl.hostname === "www.twitter.com" ||
      parsedUrl.hostname === "mobile.twitter.com"
    ) {
      logger.debug({ url }, "X.com/Twitter URL detected");
      // Extract tweet ID from URL (e.g., /status/1234567890)
      const tweetIdMatch = url.match(/\/status\/(\d+)/);
      if (tweetIdMatch) {
        const tweetId = tweetIdMatch[1];
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
            logger.warn(
              { tweetId },
              "No images found in fxtwitter API response",
            );
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
    }

    // Fetch the page using Playwright to get fully rendered HTML (including JS-loaded content)
    // This ensures we get dynamically loaded content like inline SVGs
    // We'll keep the page open to potentially screenshot SVG elements with their backgrounds
    const fetchModule = await import("./fetch");
    const browser = await (fetchModule as any).getBrowser();
    const page = await browser.newPage();

    let html: string;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      html = await page.content();
    } catch (error) {
      await page.close();
      throw error;
    }

    const $ = cheerio.load(html);

    // Strategy 1: Try og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) {
      const imageUrl = new URL(ogImage, url).toString();
      logger.debug({ imageUrl }, "Found og:image");
      const result = await fetchSingleImage(imageUrl);
      // Check if image is large enough (skip small images)
      if (result.imageData && result.imageData.length > 5000) {
        const isSvg =
          result.contentType === "image/svg+xml" ||
          imageUrl.toLowerCase().endsWith(".svg");

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
            logger.debug({ url: imageUrl }, "Converted og:image SVG to PNG");
            return {
              imageData: converted,
              contentType: "image/png",
            };
          } catch (error) {
            logger.warn(
              { error, url: imageUrl },
              "Failed to convert og:image SVG",
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
        const isSvg =
          result.contentType === "image/svg+xml" ||
          imageUrl.toLowerCase().endsWith(".svg");

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
              { url: imageUrl },
              "Converted twitter:image SVG to PNG",
            );
            return {
              imageData: converted,
              contentType: "image/png",
            };
          } catch (error) {
            logger.warn(
              { error, url: imageUrl },
              "Failed to convert twitter:image SVG",
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

    // Strategy 3: Find first meaningful image on the page
    // Priority: 1) SVG (inline or file), 2) Large image

    // First, check for inline SVG elements - try to screenshot them with their background
    let inlineSvgs = $("svg");

    if (inlineSvgs.length > 0) {
      // Try to find the SVG element on the page and screenshot it (including background from parent)
      try {
        // Find the first SVG element - check if it or its parent has a background
        const firstSvg = inlineSvgs.first();
        let elementToScreenshot = firstSvg[0];

        // Check if parent has background color/style
        const parent = firstSvg.parent();
        if (parent.length > 0) {
          const parentStyle = parent.attr("style") || "";
          const parentClass = parent.attr("class") || "";
          // If parent has background-related styles/classes, screenshot the parent instead
          if (
            parentStyle.includes("background") ||
            parentClass.includes("background") ||
            parentStyle.match(/background-?color/i)
          ) {
            // Try to find the parent element on the page
            const parentSelector = parent.length > 0 ? `:has(> svg)` : null;
            if (parentSelector) {
              try {
                const parentElement = await page
                  .locator("svg")
                  .first()
                  .locator("..")
                  .first();
                if ((await parentElement.count()) > 0) {
                  elementToScreenshot = await parentElement.elementHandle();
                }
              } catch {
                // Fallback to SVG itself
              }
            }
          }
        }

        // Try to extract SVG with its background color
        const svgLocator = page.locator("svg").first();
        if ((await svgLocator.count()) > 0) {
          // Get SVG HTML, background color, and text color from parent
          const svgData = await svgLocator.evaluate((svg: SVGSVGElement) => {
            const parent = svg.parentElement;
            const parentStyle = parent ? window.getComputedStyle(parent) : null;
            const svgStyle = window.getComputedStyle(svg);

            // Get background color from parent or SVG itself
            let backgroundColor: string | null = null;
            if (parentStyle) {
              const bgColor = parentStyle.backgroundColor;
              if (
                bgColor &&
                bgColor !== "rgba(0, 0, 0, 0)" &&
                bgColor !== "transparent"
              ) {
                backgroundColor = bgColor;
              }
            }
            if (!backgroundColor) {
              const bgColor = svgStyle.backgroundColor;
              if (
                bgColor &&
                bgColor !== "rgba(0, 0, 0, 0)" &&
                bgColor !== "transparent"
              ) {
                backgroundColor = bgColor;
              }
            }

            // Get text/foreground color from parent or SVG itself
            let textColor: string | null = null;
            if (parentStyle) {
              const color = parentStyle.color;
              if (color && color !== "rgba(0, 0, 0, 0)") {
                textColor = color;
              }
            }
            if (!textColor) {
              const color = svgStyle.color;
              if (color && color !== "rgba(0, 0, 0, 0)") {
                textColor = color;
              }
            }

            // Also check for fill color in SVG elements (common for SVG icons)
            if (!textColor) {
              const firstElement = svg.querySelector(
                "path, circle, rect, polygon, text",
              );
              if (firstElement) {
                const elementStyle = window.getComputedStyle(firstElement);
                const fill = elementStyle.fill;
                if (fill && fill !== "none" && fill !== "rgba(0, 0, 0, 0)") {
                  textColor = fill;
                }
              }
            }

            // Get SVG dimensions
            const viewBox = svg.viewBox.baseVal;
            const width = svg.width.baseVal.value || viewBox.width || 100;
            const height = svg.height.baseVal.value || viewBox.height || 100;

            // Get SVG outer HTML
            const svgHtml = svg.outerHTML;

            return {
              svgHtml,
              backgroundColor,
              textColor,
              width,
              height,
            };
          });

          if (svgData && svgData.svgHtml) {
            logger.debug(
              {
                hasBackground: !!svgData.backgroundColor,
                backgroundColor: svgData.backgroundColor,
                hasTextColor: !!svgData.textColor,
                textColor: svgData.textColor,
                width: svgData.width,
                height: svgData.height,
              },
              "Extracted SVG with background and text color",
            );

            // Extract inner SVG content (without the outer <svg> tag)
            let innerSvgContent = svgData.svgHtml
              .replace(/^<svg[^>]*>/, "")
              .replace(/<\/svg>$/, "");

            // Apply text color to SVG elements if it exists and elements don't have explicit fill
            if (svgData.textColor) {
              // Add fill to elements that don't have it, or replace existing fill with text color
              innerSvgContent = innerSvgContent.replace(
                /<(path|circle|rect|polygon|polyline|line|ellipse|text|g)([^>]*?)>/gi,
                (match: string, tag: string, attrs: string) => {
                  // Check if element already has fill attribute
                  if (!attrs.match(/\bfill\s*=/i)) {
                    // Add fill attribute with text color
                    return `<${tag}${attrs} fill="${svgData.textColor}">`;
                  } else {
                    // Replace existing fill with text color
                    return `<${tag}${attrs.replace(/\bfill\s*=\s*["'][^"']*["']/gi, `fill="${svgData.textColor}"`)}>`;
                  }
                },
              );
            }

            // Create SVG with background rectangle if background color exists
            let finalSvgHtml = svgData.svgHtml;
            if (svgData.backgroundColor || svgData.textColor) {
              // Add padding (10% on each side) to create breathing room
              const padding = Math.min(svgData.width, svgData.height) * 0.1;
              const paddedWidth = svgData.width + padding * 2;
              const paddedHeight = svgData.height + padding * 2;

              // Wrap SVG in a new SVG with background rectangle and updated content
              const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${paddedWidth}" height="${paddedHeight}" viewBox="0 0 ${paddedWidth} ${paddedHeight}">
${svgData.backgroundColor ? `  <rect width="100%" height="100%" fill="${svgData.backgroundColor}"/>` : ""}
  <g transform="translate(${padding}, ${padding})">
    ${innerSvgContent}
  </g>
</svg>`;
              finalSvgHtml = bgSvg;
            }

            // Convert to PNG
            const targetSize = isHeaderImage
              ? {
                  width: MAX_HEADER_IMAGE_WIDTH,
                  height: MAX_HEADER_IMAGE_HEIGHT,
                }
              : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };

            const converted = await sharp(Buffer.from(finalSvgHtml, "utf-8"))
              .resize(targetSize.width, targetSize.height, {
                fit: "inside",
                withoutEnlargement: false,
              })
              .png()
              .toBuffer();

            logger.debug(
              {
                originalSize: finalSvgHtml.length,
                convertedSize: converted.length,
              },
              "Successfully converted SVG with background to PNG",
            );

            await page.close();
            return {
              imageData: converted,
              contentType: "image/png",
            };
          }
        }
      } catch (error) {
        logger.debug(
          { error },
          "Failed to screenshot SVG, falling back to conversion",
        );
        // Fallback to converting SVG HTML
      }
    }

    // Fallback: try to extract and convert SVG from HTML
    let svgHtml: string | null = null;
    if (inlineSvgs.length > 0) {
      const firstSvg = inlineSvgs.first();
      svgHtml = $("<div>").append(firstSvg.clone()).html();
    } else {
      // Fallback: try to extract SVG from raw HTML string
      const svgMatch = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
      if (svgMatch && svgMatch[0] && svgMatch[0].length > 200) {
        svgHtml = svgMatch[0];
        logger.debug(
          { svgLength: svgHtml.length },
          "Found inline SVG in raw HTML (cheerio didn't parse it)",
        );
      }
    }

    logger.debug(
      {
        svgCount: inlineSvgs.length,
        svgHtmlLength: svgHtml?.length,
        htmlLength: html.length,
      },
      "Checking for inline SVGs",
    );

    if (svgHtml && svgHtml.length > 200) {
      // Check if SVG has meaningful content (has path elements)
      const hasPaths =
        svgHtml.includes("<path") || svgHtml.includes("&lt;path");

      if (hasPaths || svgHtml.length > 500) {
        logger.debug(
          {
            size: svgHtml.length,
            hasPaths,
          },
          "Found inline SVG, converting to PNG",
        );
        try {
          const targetSize = isHeaderImage
            ? { width: MAX_HEADER_IMAGE_WIDTH, height: MAX_HEADER_IMAGE_HEIGHT }
            : { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT };
          const converted = await sharp(Buffer.from(svgHtml, "utf-8"))
            .resize(targetSize.width, targetSize.height, {
              fit: "inside",
              withoutEnlargement: false,
            })
            .png()
            .toBuffer();
          logger.debug(
            { originalSize: svgHtml.length, convertedSize: converted.length },
            "Successfully converted inline SVG to PNG",
          );
          await page.close();
          return {
            imageData: converted,
            contentType: "image/png",
          };
        } catch (error) {
          logger.warn(
            { error, svgLength: svgHtml.length },
            "Failed to convert inline SVG",
          );
        }
      }
    }

    // Second, check for SVG image files
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
        { imageUrl: firstLargeImageUrl },
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

    await page.close();
    return null;
  } catch (error) {
    logger.warn({ error, url }, "Failed to extract image from URL");
    // Make sure page is closed even on error
    try {
      const page = (error as any).page;
      if (page) await page.close();
    } catch {
      // Ignore cleanup errors
    }
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
 * 1. Skip if URL already exists in this feed (unless forceRefresh)
 * 2. Skip if article with same name exists in last 2 weeks in this feed (unless forceRefresh)
 *
 * @param article - The article to check
 * @param forceRefresh - If true, don't skip existing articles
 * @returns Object with shouldSkip boolean and optional reason string
 */
export async function shouldSkipArticleByDuplicate(
  article: { url: string; title: string },
  feedId: number,
  forceRefresh: boolean,
): Promise<{ shouldSkip: boolean; reason: string | null }> {
  // Import here to avoid circular dependency
  const { db, articles } = await import("../../db");
  const { eq, and, gte } = await import("drizzle-orm");

  // If forcing refresh, don't skip
  if (forceRefresh) {
    return { shouldSkip: false, reason: null };
  }

  // Check 1: URL already exists in this feed
  const [existingByUrl] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.url, article.url), eq(articles.feedId, feedId)))
    .limit(1);

  if (existingByUrl) {
    return { shouldSkip: true, reason: null }; // Don't log for existing articles (too verbose)
  }

  // Check 2: Article with same name exists in last 2 weeks (only in this feed)
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const [existingByName] = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.name, article.title),
        eq(articles.feedId, feedId),
        gte(articles.date, twoWeeksAgo),
      ),
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
