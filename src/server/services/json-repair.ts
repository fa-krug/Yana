/**
 * JSON repair utilities for fixing common truncation issues in AI responses.
 * Handles unclosed strings, missing braces, and malformed JSON structure.
 */

import { logger } from "../utils/logger";

/**
 * HTML closing tag patterns used to find reasonable truncation points.
 */
const HTML_CLOSING_PATTERNS = [
  /<\/div>/gi,
  /<\/p>/gi,
  /<\/ul>/gi,
  /<\/li>/gi,
  /<\/h[1-6]>/gi,
  /<\/article>/gi,
  /<\/section>/gi,
];

/**
 * Repair JSON by fixing common issues from truncated responses.
 */
export function repairJson(content: string): string {
  if (!content || !content.trim()) return content;

  let repaired = content.trim();

  // If content starts with { but doesn't end with }, try to close it
  if (repaired.startsWith("{") && !repaired.endsWith("}")) {
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;

    if (openBraces > closeBraces) {
      // Try to fix truncated string value and add missing braces
      repaired = fixTruncatedStringValue(repaired);
      repaired = addMissingClosingBraces(repaired, openBraces, closeBraces);
    }
  }

  return repaired;
}

/**
 * Fix a truncated string value in JSON.
 * Attempts to find HTML closing tags or other boundaries as truncation points.
 */
function fixTruncatedStringValue(content: string): string {
  const lastColon = content.lastIndexOf(":");
  if (lastColon <= 0) {
    return content;
  }

  const afterColon = content.substring(lastColon + 1).trim();
  if (!afterColon.startsWith('"') || afterColon.endsWith('"')) {
    return content; // String is either closed or not present
  }

  // String is unclosed - try to find a reasonable place to close it
  const lastValidPos = findLastHtmlClosingTagPosition(content);

  if (lastValidPos > 0) {
    return content.substring(0, lastValidPos) + '"';
  }

  // Fallback: use character boundary detection
  return closeStringAtCharacterBoundary(content, lastColon);
}

/**
 * Find the position of the last HTML closing tag in content.
 * Returns -1 if no HTML closing tags are found.
 */
function findLastHtmlClosingTagPosition(content: string): number {
  let lastValidPos = -1;

  for (const pattern of HTML_CLOSING_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined) {
        const matchEndPos = lastMatch.index + lastMatch[0].length;
        if (matchEndPos > lastValidPos) {
          lastValidPos = matchEndPos;
        }
      }
    }
  }

  return lastValidPos;
}

/**
 * Close an unclosed string at a reasonable character boundary.
 * Looks for natural break characters (>, space, newline) after the last quote.
 */
function closeStringAtCharacterBoundary(
  content: string,
  colonPos: number,
): string {
  let result = content;
  const lastQuote = content.lastIndexOf('"');

  if (lastQuote <= colonPos) {
    return result; // No quote found after colon
  }

  const breakChars = [">", " ", "\n"];
  for (const breakChar of breakChars) {
    const breakPos = content.lastIndexOf(breakChar, lastQuote);
    if (breakPos > lastQuote) {
      result =
        content.substring(0, breakPos + 1) +
        '"' +
        content.substring(breakPos + 1);
      break;
    }
  }

  // Ensure string is closed
  if (!result.endsWith('"')) {
    result += '"';
  }

  return result;
}

/**
 * Add missing closing braces to JSON.
 */
function addMissingClosingBraces(
  content: string,
  openCount: number,
  closeCount: number,
): string {
  const missingCount = openCount - closeCount;
  let result = content;

  for (let i = 0; i < missingCount; i++) {
    result += "}";
  }

  return result;
}
