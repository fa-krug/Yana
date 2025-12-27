/**
 * Main image extraction function.
 */

import * as cheerio from "cheerio";

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../../exceptions";
import { is4xxError } from "../http-errors";

import {
  handleDirectImageUrl,
  handleYouTubeThumbnail,
  handleTwitterImage,
  handleMetaTagImage,
  handleInlineSvg,
  handlePageImages,
} from "./strategies/index";

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
      const result = await handleDirectImageUrl(url, isHeaderImage);
      if (result) return result;
    }

    // Special handling for YouTube URLs
    const youtubeResult = await handleYouTubeThumbnail(url);
    if (youtubeResult) return youtubeResult;

    // Special handling for X.com/Twitter URLs
    const twitterResult = await handleTwitterImage(url);
    if (twitterResult) return twitterResult;

    // Fetch the page using Playwright to get fully rendered HTML (including JS-loaded content)
    // This ensures we get dynamically loaded content like inline SVGs
    // We'll keep the page open to potentially screenshot SVG elements with their backgrounds
    const fetchModule = await import("../../fetch");
    const browser = await fetchModule.getBrowser();
    const page = await browser.newPage();

    let html: string;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      html = await page.content();
    } catch (error) {
      await page.close();
      // Check for 4xx errors from Playwright navigation
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        if (
          errorMsg.includes("404") ||
          errorMsg.includes("403") ||
          errorMsg.includes("401") ||
          errorMsg.includes("410") ||
          errorMsg.includes("net::err_aborted")
        ) {
          const statusMatch = errorMsg.match(/\b(40\d|41\d)\b/);
          const extractedStatus = statusMatch
            ? parseInt(statusMatch[1], 10)
            : null;
          if (
            extractedStatus &&
            extractedStatus >= 400 &&
            extractedStatus < 500
          ) {
            throw new ArticleSkipError(
              `Failed to extract image from URL: ${extractedStatus} ${error.message}`,
              undefined,
              extractedStatus,
              error,
            );
          }
        }
      }
      // Also check if it's an axios error (from redirects)
      const statusCode = is4xxError(error);
      if (statusCode !== null) {
        throw new ArticleSkipError(
          `Failed to extract image from URL: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
          undefined,
          statusCode,
          error instanceof Error ? error : undefined,
        );
      }
      throw error;
    }

    const $ = cheerio.load(html);

    // Strategy 1: Try og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) {
      const result = await handleMetaTagImage(ogImage, url, isHeaderImage);
      if (result) {
        await page.close();
        return result;
      }
    }

    // Strategy 2: Try twitter:image meta tag
    const twitterImage = $('meta[name="twitter:image"]').attr("content");
    if (twitterImage) {
      const result = await handleMetaTagImage(twitterImage, url, isHeaderImage);
      if (result) {
        await page.close();
        return result;
      }
    }

    // Strategy 3: Find first meaningful image on the page
    // Priority: 1) SVG (inline or file), 2) Large image

    // First, check for inline SVG elements - try to screenshot them with their background
    const svgResult = await handleInlineSvg(page, $, html, url, isHeaderImage);
    if (svgResult) {
      await page.close();
      return svgResult;
    }

    // Second, check for SVG image files and other images
    const pageImageResult = await handlePageImages($, url, isHeaderImage);
    if (pageImageResult) {
      await page.close();
      return pageImageResult;
    }

    await page.close();
    return null;
  } catch (error) {
    // Re-throw ArticleSkipError to propagate it up
    if (error instanceof ArticleSkipError) {
      throw error;
    }
    logger.warn({ error, url }, "Failed to extract image from URL");
    // Make sure page is closed even on error
    try {
      const page = (error as { page?: { close: () => Promise<void> } }).page;
      if (page) await page.close();
    } catch {
      // Ignore cleanup errors
    }
    return null;
  }
}
