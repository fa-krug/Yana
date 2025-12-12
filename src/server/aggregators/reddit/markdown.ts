/**
 * Reddit markdown conversion utilities.
 */

import { marked } from "marked";
import { decodeHtmlEntitiesInUrl } from "./urls";

// Configure marked with extensions similar to Python version
// nl2br: Convert newlines to <br> (handled by breaks option)
// fenced_code: Support ```code blocks``` (enabled by default)
// tables: Support tables (enabled by default)
marked.setOptions({
  breaks: true, // Convert newlines to <br> (like nl2br extension)
  gfm: true, // GitHub Flavored Markdown (includes tables, strikethrough, etc.)
});

/**
 * Convert Reddit markdown to HTML.
 * Handles Reddit-specific markdown extensions like ^superscript,
 * ~~strikethrough~~, >!spoilers!<, and Giphy embeds.
 * Then converts standard markdown to HTML using marked library.
 */
export async function convertRedditMarkdown(text: string): Promise<string> {
  if (!text) return "";

  // Handle Reddit preview images
  text = text.replace(
    /(?<!\[\(])https?:\/\/preview\.redd\.it\/[^\s\)]+/g,
    (match) => {
      const decodedUrl = decodeHtmlEntitiesInUrl(match);
      return `<img src="${decodedUrl}" alt="Reddit preview image">`;
    },
  );

  // Convert markdown links with preview.redd.it URLs to image tags
  text = text.replace(
    /\[([^\]]*)\]\((https?:\/\/preview\.redd\.it\/[^\)]+)\)/g,
    (_, alt, url) => {
      const decodedUrl = decodeHtmlEntitiesInUrl(url);
      return `<img src="${decodedUrl}" alt="${alt || "Reddit preview image"}">`;
    },
  );

  // Handle Giphy images
  text = text.replace(
    /!\[([^\]]*)\]\(giphy\|([a-zA-Z0-9]+)(?:\|[^\)]+)?\)/gi,
    (_, __, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  text = text.replace(
    /<img\s+[^>]*src=\s*["']giphy\|([^"'\|]+)[^"']*["'][^>]*>/gi,
    (_, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  text = text.replace(
    /(?<!["'])giphy\|([a-zA-Z0-9]+)(?!["'])/g,
    (_, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  // Handle Reddit-specific superscript syntax (before markdown conversion)
  text = text.replace(/\^(\w+)/g, "<sup>$1</sup>");
  text = text.replace(/\^\(([^)]+)\)/g, "<sup>$1</sup>");

  // Handle strikethrough (before markdown conversion)
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Handle spoiler syntax (before markdown conversion)
  text = text.replace(
    />!(.+?)!</g,
    '<span class="spoiler" style="background: #000; color: #000;">$1</span>',
  );

  // Convert markdown to HTML using marked
  // Note: strikethrough and superscript are already handled above,
  // but marked will handle other markdown features like headers, lists, links, etc.
  const htmlContent = await marked.parse(text);

  return htmlContent as string;
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
