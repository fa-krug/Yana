/**
 * Mein-MMO content extraction utilities.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type pino from "pino";

import { extractContent } from "../base/extract";
import type { RawArticle } from "../base/types";
import {
  FigureProcessingOrchestrator,
  type FigureProcessingContext,
} from "./figure-processing-strategy";
import {
  YouTubeEmbedStrategy,
  YouTubeFallbackStrategy,
  TwitterEmbedStrategy,
  RedditEmbedStrategy,
} from "./figure-strategies";

/**
 * Extract Mein-MMO specific content.
 */
export async function extractMeinMmoContent(
  html: string,
  article: RawArticle,
  isMultiPage: boolean,
  selectorsToRemove: readonly string[],
  logger: pino.Logger,
  aggregatorId: string,
  feedId: number | null | undefined,
): Promise<string> {
  const $ = cheerio.load(html);

  // For multi-page articles, the HTML already contains combined content divs
  // For single-page articles, we need to extract the content first
  if (!isMultiPage) {
    // Extract content using base extractContent function
    const extracted = extractContent(html, {
      selectorsToRemove: Array.from(selectorsToRemove),
      contentSelector: "div.gp-entry-content",
    });
    // Reload with extracted content
    $.root().html(extracted);
  } else {
    // For multi-page, remove unwanted elements from the combined HTML
    for (const selector of selectorsToRemove) {
      $(selector).remove();
    }
  }

  // Handle multi-page articles: find ALL content divs, not just the first one
  const contentDivs = $("div.gp-entry-content");
  if (contentDivs.length === 0) {
    logger.warn(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: aggregatorId,
        feedId,
        url: article.url,
      },
      "Could not find article content",
    );
    // Fallback: return the HTML as-is
    return isMultiPage ? html : $.html();
  }

  // If multi-page, we'll have multiple divs - wrap them in a container
  let content: cheerio.Cheerio<AnyNode>;
  if (contentDivs.length > 1) {
    logger.info(
      {
        step: "extractContent",
        subStep: "extractMeinMmo",
        aggregator: aggregatorId,
        feedId,
        pageCount: contentDivs.length,
      },
      "Processing multi-page article",
    );
    // Create a wrapper div to contain all pages
    const wrapper = $('<div class="gp-entry-content"></div>');
    contentDivs.each((_, div) => {
      // Move all children from each page div into the wrapper
      $(div)
        .children()
        .each((_, child) => {
          wrapper.append(child);
        });
    });
    content = wrapper;
  } else {
    content = contentDivs.first();
  }

  // Process figure elements using strategy pattern
  const orchestrator = new FigureProcessingOrchestrator([
    new YouTubeEmbedStrategy(),
    new TwitterEmbedStrategy(),
    new RedditEmbedStrategy(),
    new YouTubeFallbackStrategy(),
  ]);

  orchestrator.processAllFigures($, content, {
    logger,
    aggregatorId,
    feedId,
  });

  // Remove empty elements
  content.find("p, div").each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && $el.find("img").length === 0) {
      $el.remove();
    }
  });

  // Clean data attributes (except data-src and data-srcset)
  content.find("*").each((_, el) => {
    const $el = $(el);
    const attrs = $el.get(0)?.attribs || {};
    for (const attrName of Object.keys(attrs)) {
      if (
        attrName.startsWith("data-") &&
        attrName !== "data-src" &&
        attrName !== "data-srcset"
      ) {
        $el.removeAttr(attrName);
      }
    }
  });

  return content.html() || "";
}
