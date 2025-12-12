/**
 * Image dimension extraction utilities.
 */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";

/**
 * Extract image dimensions from HTML attributes and CSS styles.
 * Returns { width, height } if both are found, null otherwise.
 */
export function extractImageDimensions(
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
