/**
 * Content extraction utilities.
 */

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { logger } from "../../utils/logger";
import { removeElementsBySelectors } from "./utils";

export interface ExtractOptions {
  selectorsToRemove?: string[];
  contentSelector?: string;
}

/**
 * Extract content from HTML.
 */
export function extractContent(
  html: string,
  options: ExtractOptions = {},
): string {
  const { selectorsToRemove = [], contentSelector } = options;

  try {
    const $ = cheerio.load(html);

    // Extract main content FIRST (before removing elements)
    // This matches the Python behavior: extract_content() runs before remove_unwanted_elements()
    let content: cheerio.Cheerio<AnyNode>;
    if (contentSelector) {
      content = $(contentSelector);
      if (content.length === 0) {
        logger.warn(
          { contentSelector },
          "Content selector found no elements, using body",
        );
        content = $("body");
      }
    } else {
      // Try common content selectors
      content =
        $(
          "article, .article, .post, .entry, .content, main, #content",
        ).first() || $("body");
    }

    // Get HTML content from extracted element
    let text = content.html() || "";

    // Now remove unwanted elements from the EXTRACTED content (not the full HTML)
    // This ensures nested unwanted elements inside the content selector are removed
    const cleaned = cheerio.load(text);

    // Remove unwanted elements by selectors from extracted content
    if (selectorsToRemove.length > 0) {
      for (const selector of selectorsToRemove) {
        try {
          cleaned(selector).remove();
        } catch (error) {
          logger.warn(
            { error, selector },
            "Failed to remove elements with selector",
          );
        }
      }
    }

    // Remove scripts, styles, etc. from extracted content
    cleaned("script, style, noscript, iframe, embed, object").remove();

    // Remove YouTube-specific elements that shouldn't be in content
    cleaned(".ytd-app").remove();

    text = cleaned.html() || "";

    // Clean up empty tags
    cleaned("p, div, span").each((_, el) => {
      const $el = cleaned(el);
      const textContent = $el.text().trim();
      const hasImages = $el.find("img").length > 0;
      if (!textContent && !hasImages) {
        $el.remove();
      }
    });

    // Clean data attributes (except data-src and data-srcset which are needed for images)
    cleaned("*").each((_, el) => {
      const $el = cleaned(el);
      // Check if element is an Element type (has attribs property)
      if ("attribs" in el && el.attribs) {
        const attrs = el.attribs;
        const attrsToRemove: string[] = [];
        for (const attr of Object.keys(attrs)) {
          if (
            attr.startsWith("data-") &&
            attr !== "data-src" &&
            attr !== "data-srcset" &&
            !attr.startsWith("data-sanitized-")
          ) {
            attrsToRemove.push(attr);
          }
        }
        for (const attr of attrsToRemove) {
          $el.removeAttr(attr);
        }
      }
    });

    text = cleaned.html() || "";

    // Clean up whitespace and comments
    text = text
      .replace(/\s+/g, " ")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();

    return text;
  } catch (error) {
    logger.error({ error }, "Failed to extract content");
    return html; // Fallback to original HTML
  }
}
