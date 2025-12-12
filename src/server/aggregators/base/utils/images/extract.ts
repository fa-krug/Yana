/**
 * Main image extraction function.
 */

import * as cheerio from "cheerio";
import { logger } from "../../../../utils/logger";
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
