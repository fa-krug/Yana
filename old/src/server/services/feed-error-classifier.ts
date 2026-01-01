/**
 * Feed preview error classification.
 *
 * Classifies errors during feed preview into categories (authentication,
 * timeout, network, parse, unknown) for better error reporting.
 */

type ErrorType =
  | "validation"
  | "network"
  | "parse"
  | "authentication"
  | "timeout"
  | "unknown";

export interface ClassificationResult {
  errorType: ErrorType;
  errorMessage: string;
}

/**
 * Classify an error during feed preview.
 * Maps error messages to standard error categories.
 */
export function classifyFeedError(error: unknown): ClassificationResult {
  const errorMsg = extractErrorMessage(error).toLowerCase();

  if (isAuthenticationError(errorMsg)) {
    return {
      errorType: "authentication",
      errorMessage: `Authentication failed: ${getErrorString(error)}`,
    };
  }

  if (isTimeoutError(errorMsg)) {
    return {
      errorType: "timeout",
      errorMessage: `Request timed out: ${getErrorString(error)}`,
    };
  }

  if (isNetworkError(errorMsg)) {
    return {
      errorType: "network",
      errorMessage: `Network error: ${getErrorString(error)}`,
    };
  }

  if (isParseError(errorMsg)) {
    return {
      errorType: "parse",
      errorMessage: `Could not parse feed: ${getErrorString(error)}`,
    };
  }

  return {
    errorType: "unknown",
    errorMessage: `An error occurred: ${getErrorString(error)}`,
  };
}

/**
 * Extract error message from unknown error object.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "");
}

/**
 * Convert error to displayable string.
 */
function getErrorString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if error is authentication-related.
 */
function isAuthenticationError(errorMsg: string): boolean {
  return (
    errorMsg.includes("authentication") ||
    errorMsg.includes("unauthorized") ||
    errorMsg.includes("forbidden")
  );
}

/**
 * Check if error is timeout-related.
 */
function isTimeoutError(errorMsg: string): boolean {
  return errorMsg.includes("timeout") || errorMsg.includes("timed out");
}

/**
 * Check if error is network-related.
 */
function isNetworkError(errorMsg: string): boolean {
  return errorMsg.includes("connection") || errorMsg.includes("network");
}

/**
 * Check if error is parse-related.
 */
function isParseError(errorMsg: string): boolean {
  return (
    errorMsg.includes("parse") ||
    errorMsg.includes("xml") ||
    errorMsg.includes("feed")
  );
}
