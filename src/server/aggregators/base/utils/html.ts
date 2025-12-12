/**
 * HTML utility functions.
 */

import * as cheerio from "cheerio";
import { logger } from "../../../utils/logger";

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
