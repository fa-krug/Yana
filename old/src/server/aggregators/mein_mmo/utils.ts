/**
 * Mein-MMO utility functions.
 */

import * as cheerio from "cheerio";
import type pino from "pino";

import type { RawArticle } from "../base/types";

/**
 * Extract header image with width="16" and height="9".
 */
export function getHeaderImageUrl(
  html: string,
  article: RawArticle,
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | null | undefined,
): string | undefined {
  const $ = cheerio.load(html);

  // First, look for image with width="16" and height="9"
  const headerImg = $('img[width="16"][height="9"]').first();
  if (headerImg.length > 0) {
    const src = headerImg.attr("src");
    if (src) {
      logger.info(
        {
          step: "enrichArticles",
          subStep: "processContent",
          aggregator: aggregatorId,
          feedId,
          url: src,
        },
        "Found header image (16x9)",
      );
      return src;
    }
  }

  // Fallback: Look for the header div
  const headerDiv = $("div#gp-page-header-inner").first();
  if (headerDiv.length > 0) {
    const headerImg = headerDiv.find("img").first();
    if (headerImg.length > 0) {
      const src = headerImg.attr("src");
      if (src) {
        logger.info(
          {
            step: "enrichArticles",
            subStep: "processContent",
            aggregator: aggregatorId,
            feedId,
            url: src,
          },
          "Found header image from header div",
        );
        return src;
      }
    }
  }

  return undefined;
}
