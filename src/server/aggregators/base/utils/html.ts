/**
 * HTML utility functions.
 */

import * as cheerio from "cheerio";

import { logger } from "@server/utils/logger";

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
 * Rename element attributes to sanitize.
 */
function renameAttributes(
  $el: cheerio.Cheerio<cheerio.AnyNode>,
  el: cheerio.AnyNode,
): void {
  const classAttr = $el.attr("class");
  if (classAttr && !classAttr.includes("youtube-embed-container")) {
    $el.attr("data-sanitized-class", classAttr).removeAttr("class");
  }

  const styleAttr = $el.attr("style");
  if (styleAttr) {
    const isYT =
      ($el.is("iframe") &&
        ($el.attr("src")?.includes("/api/youtube-proxy") ||
          $el.closest(".youtube-embed-container").length > 0)) ||
      $el.closest(".youtube-embed-container").length > 0;
    if (!isYT) $el.attr("data-sanitized-style", styleAttr).removeAttr("style");
  }

  const idAttr = $el.attr("id");
  if (idAttr) $el.attr("data-sanitized-id", idAttr).removeAttr("id");

  if ("attribs" in el && el.attribs) {
    Object.keys(el.attribs).forEach((attr) => {
      if (
        attr.startsWith("data-") &&
        attr !== "data-src" &&
        attr !== "data-srcset" &&
        !attr.startsWith("data-sanitized-")
      ) {
        $el.attr(`data-sanitized-${attr}`, el.attribs[attr]).removeAttr(attr);
      }
    });
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
    $("script, object, embed").remove();

    $("style, iframe").each((_, el) => {
      const $el = $(el);
      const isYT =
        $el.closest(".youtube-embed-container").length > 0 ||
        ($el.is("iframe") &&
          ($el.attr("src") || "").includes("/api/youtube-proxy"));
      if (!isYT) $el.remove();
    });

    $("*").each((_, el) => renameAttributes($(el), el));

    const sanitized = $.html();
    logger.debug({ length: sanitized.length }, "HTML sanitized");
    return sanitized;
  } catch (error) {
    logger.error({ error }, "Error sanitizing HTML");
    return html;
  }
}
