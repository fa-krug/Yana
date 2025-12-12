/**
 * Mein-MMO content extraction utilities.
 */

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type pino from "pino";
import type { RawArticle } from "../base/types";
import { extractContent } from "../base/extract";
import { isTwitterUrl } from "../base/utils";

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

  // Convert embed consent placeholders to direct links
  content.find("figure").each((_, figureEl) => {
    const $figure = $(figureEl);

    // Check if this is a YouTube embed placeholder
    let youtubeLink: string | undefined;
    const youtubeLinks = $figure.find("a[href]").filter((_, linkEl) => {
      const href = $(linkEl).attr("href") || "";
      return href.includes("youtube.com") || href.includes("youtu.be");
    });
    if (youtubeLinks.length > 0) {
      youtubeLink = $(youtubeLinks[0]).attr("href") || undefined;
    }

    // Check if this is a Twitter/X embed placeholder
    let twitterLink: string | undefined;
    if (!youtubeLink) {
      const twitterLinks = $figure.find("a[href]").filter((_, linkEl) => {
        const href = $(linkEl).attr("href") || "";
        return isTwitterUrl(href);
      });
      if (twitterLinks.length > 0) {
        twitterLink = $(twitterLinks[0]).attr("href") || undefined;
      }
    }

    if (youtubeLink) {
      // Extract YouTube URL (clean up tracking parameters)
      let cleanUrl = youtubeLink;
      if (cleanUrl.includes("?") && !cleanUrl.includes("youtube.com/watch")) {
        cleanUrl = cleanUrl.split("?")[0];
      }

      // Replace figure with simple link
      const newP = $("<p></p>");
      const newLink = $("<a></a>")
        .attr("href", cleanUrl)
        .attr("target", "_blank")
        .attr("rel", "noopener")
        .text("Watch on YouTube");
      newP.append(newLink);

      $figure.replaceWith(newP);
      logger.debug(
        {
          step: "extractContent",
          subStep: "extractMeinMmo",
          aggregator: aggregatorId,
          feedId,
          url: cleanUrl,
        },
        "Converted YouTube embed to link",
      );
    } else if (twitterLink) {
      // Extract tweet URL (clean up tracking parameters)
      let cleanUrl = twitterLink;
      if (cleanUrl.includes("?")) {
        cleanUrl = cleanUrl.split("?")[0];
      }

      // Get caption text if available
      const figcaption = $figure.find("figcaption");
      const captionText = figcaption.length > 0 ? figcaption.text().trim() : "";

      // Replace figure with clean link
      const newP = $("<p></p>");
      const newLink = $("<a></a>")
        .attr("href", cleanUrl)
        .attr("target", "_blank")
        .attr("rel", "noopener")
        .text(`View on X/Twitter: ${cleanUrl}`);
      newP.append(newLink);

      if (captionText) {
        newP.append("<br>");
        const captionSpan = $("<em></em>").text(captionText);
        newP.append(captionSpan);
      }

      $figure.replaceWith(newP);
      logger.debug(
        {
          step: "extractContent",
          subStep: "extractMeinMmo",
          aggregator: aggregatorId,
          feedId,
          url: cleanUrl,
        },
        "Converted Twitter/X embed to link",
      );
    }
  });

  // Standardize Reddit embeds (separate loop as they have different structure)
  content.find("figure").each((_, figureEl) => {
    const $figure = $(figureEl);

    // Check if this is a Reddit embed by looking for provider-reddit class
    const sanitizedClass = $figure.attr("data-sanitized-class") || "";
    if (
      sanitizedClass.includes("provider-reddit") ||
      sanitizedClass.includes("embed-reddit")
    ) {
      // Extract Reddit URL from the embed
      let redditLink: string | undefined;
      const redditLinks = $figure.find("a[href]").filter((_, linkEl) => {
        const href = $(linkEl).attr("href") || "";
        return href.includes("reddit.com");
      });
      if (redditLinks.length > 0) {
        redditLink = $(redditLinks[0]).attr("href") || undefined;
      }

      if (redditLink) {
        // Clean up tracking parameters
        let cleanUrl = redditLink;
        if (cleanUrl.includes("?")) {
          cleanUrl = cleanUrl.split("?")[0];
        }

        // Replace figure with simple link
        const newP = $("<p></p>");
        const newLink = $("<a></a>")
          .attr("href", cleanUrl)
          .attr("target", "_blank")
          .attr("rel", "noopener")
          .text("View on Reddit");
        newP.append(newLink);

        $figure.replaceWith(newP);
        logger.debug(
          {
            step: "extractContent",
            subStep: "extractMeinMmo",
            aggregator: aggregatorId,
            feedId,
            url: cleanUrl,
          },
          "Converted Reddit embed to link",
        );
      }
    }
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
