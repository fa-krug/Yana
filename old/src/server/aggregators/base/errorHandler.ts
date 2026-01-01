/**
 * Aggregator error handling and classification.
 */

import { ContentFetchError, ParseError } from "./exceptions";

export type ErrorType =
  | "network"
  | "timeout"
  | "parse"
  | "validation"
  | "unknown";

/**
 * Classify error type.
 */
export function classifyError(error: unknown): ErrorType {
  if (error instanceof ContentFetchError) {
    const message = error.message.toLowerCase();
    if (message.includes("timeout") || message.includes("timed out")) {
      return "timeout";
    }
    if (
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("econnrefused")
    ) {
      return "network";
    }
  }

  if (error instanceof ParseError) {
    return "parse";
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("timeout") || message.includes("timed out")) {
      return "timeout";
    }
    if (
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    ) {
      return "network";
    }
    if (message.includes("parse") || message.includes("json")) {
      return "parse";
    }
  }

  return "unknown";
}
