/**
 * Main image extraction function.
 */

import * as cheerio from "cheerio";

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../../exceptions";

import { handlePlaywrightNavigationError } from "./playwright-error-handler";
import {
  handleDirectImageUrl,
  handleYouTubeThumbnail,
  handleTwitterImage,
  handleMetaTagImage,
  handleInlineSvg,
  handlePageImages,
} from "./strategies/index";

/**
 * Try meta tag image strategies.
 */
async function tryMetaTagStrategies(
  $: cheerio.CheerioAPI,
  url: string,
  isHeaderImage: boolean,
): Promise<{ imageData: Buffer; contentType: string } | null> {
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    const result = await handleMetaTagImage(ogImage, url, isHeaderImage);
    if (result) return result;
  }

  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) {
    const result = await handleMetaTagImage(twitterImage, url, isHeaderImage);
    if (result) return result;
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
    const parsedUrl = new URL(url);
    const urlPath = parsedUrl.pathname.toLowerCase();

    if (
      [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].some((ext) =>
        urlPath.endsWith(ext),
      )
    ) {
      const result = await handleDirectImageUrl(url, isHeaderImage);
      if (result) return result;
    }

    const youtubeResult = await handleYouTubeThumbnail(url);
    if (youtubeResult) return youtubeResult;

    const twitterResult = await handleTwitterImage(url);
    if (twitterResult) return twitterResult;

    const fetchModule = await import("../../fetch");
    const browser = await fetchModule.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      const html = await page.content();
      const $ = cheerio.load(html);

      const metaResult = await tryMetaTagStrategies($, url, isHeaderImage);
      if (metaResult) {
        await page.close();
        return metaResult;
      }

      const svgResult = await handleInlineSvg(
        page,
        $,
        html,
        url,
        isHeaderImage,
      );
      if (svgResult) {
        await page.close();
        return svgResult;
      }

      const pageImageResult = await handlePageImages($, url, isHeaderImage);
      if (pageImageResult) {
        await page.close();
        return pageImageResult;
      }

      await page.close();
      return null;
    } catch (error) {
      await page.close();
      handlePlaywrightNavigationError(error, url);
    }
  } catch (error) {
    if (error instanceof ArticleSkipError) throw error;
    logger.warn({ error, url }, "Failed to extract image from URL");
    return null;
  }
  return null;
}
