/**
 * AI response parser for structured JSON output.
 * Handles JSON parsing, repair, and validation with truncation detection.
 */

import { logger } from "../utils/logger";

import { repairJson } from "./json-repair";

export interface ParsedResponse {
  content: string;
  isTruncated: boolean;
  wasRepaired: boolean;
}

/**
 * Parses and validates AI API responses.
 * Handles JSON parsing with automatic repair for truncated responses.
 */
export class AIResponseParser {
  /**
   * Check if response was truncated based on finish_reason.
   */
  isTruncated(finishReason: string): boolean {
    return finishReason === "length";
  }

  /**
   * Log truncation warning with context.
   */
  logTruncation(contentLength: number, maxTokens: number): void {
    logger.warn(
      {
        contentLength,
        maxTokens,
      },
      "AI response was truncated",
    );
  }

  /**
   * Attempt to parse JSON content with automatic repair.
   * Returns parsed object if successful, throws if all attempts fail.
   */
  parseJSON(
    content: string,
    finishReason: string,
    maxTokens: number,
    maxRetries: number,
    attempt: number,
  ): Record<string, unknown> {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch (jsonError) {
      return this.handleJsonParseError(
        content,
        jsonError,
        finishReason,
        maxTokens,
        maxRetries,
        attempt,
      );
    }
  }

  /**
   * Handle JSON parsing error with repair attempt.
   * Logs warnings and attempts repair strategy.
   */
  private handleJsonParseError(
    content: string,
    jsonError: unknown,
    finishReason: string,
    maxTokens: number,
    maxRetries: number,
    attempt: number,
  ): Record<string, unknown> {
    const contentPreview =
      content.length > 500 ? content.substring(0, 500) : content;

    logger.warn(
      {
        attempt: attempt + 1,
        maxRetries,
        contentLength: content.length,
        finishReason,
        contentPreview,
      },
      "JSON parse error",
    );

    // Try to repair JSON
    const repairedContent = repairJson(content);
    if (repairedContent !== content) {
      try {
        logger.info("Attempting to parse repaired JSON");
        return JSON.parse(repairedContent) as Record<string, unknown>;
      } catch (repairError) {
        logger.warn({ error: repairError }, "Repaired JSON still invalid");
      }
    }

    // If we can retry, throw to signal retry needed
    if (attempt < maxRetries - 1) {
      const error = new Error("JSON parse failed, will retry");
      throw { ...error, isJsonParseError: true };
    }

    // Final attempt failed - throw descriptive error
    const contentPreviewStr = contentPreview.substring(0, 300);
    if (finishReason === "length") {
      throw new Error(
        `Failed to parse JSON response after ${maxRetries} attempts. ` +
          `Response was truncated. Consider increasing max_tokens (current: ${maxTokens}). ` +
          `Content preview: ${contentPreviewStr}...`,
      );
    } else {
      throw new Error(
        `Failed to parse JSON response after ${maxRetries} attempts. ` +
          `Content length: ${content.length} chars, finish_reason: ${finishReason}`,
      );
    }
  }

  /**
   * Check if error is a JSON parse error that should trigger retry.
   */
  isJsonParseError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    if (!("isJsonParseError" in error)) {
      return false;
    }
    return (error as Record<string, unknown>)["isJsonParseError"] === true;
  }
}
