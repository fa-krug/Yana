/**
 * Playwright error handling and HTTP status extraction.
 *
 * Handles Playwright navigation errors and extracts HTTP status codes
 * from error messages for proper error classification.
 */

import { ArticleSkipError } from "../../exceptions";
import { is4xxError } from "../http-errors";

/**
 * Extract HTTP status code from Playwright error message.
 * Returns status code (400-599) or null if not found.
 */
export function extractHttpStatusFromPlaywrightError(
  error: unknown,
): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const errorMsg = error.message.toLowerCase();

  // Check for specific status codes in error message
  const statusMatch = /\b(40\d|41\d|50\d)\b/.exec(errorMsg);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    if (status >= 400 && status < 600) {
      return status;
    }
  }

  return null;
}

/**
 * Check if error is a 4xx HTTP error (either Playwright or Axios).
 */
export function isHttpClientError(error: unknown): boolean {
  // Check Playwright error
  const playwrightStatus = extractHttpStatusFromPlaywrightError(error);
  if (playwrightStatus && playwrightStatus >= 400 && playwrightStatus < 500) {
    return true;
  }

  // Check Axios error
  const axiosStatus = is4xxError(error);
  return axiosStatus !== null;
}

/**
 * Get HTTP status code from error (Playwright or Axios).
 */
export function getHttpStatusCode(error: unknown): number | null {
  const playwrightStatus = extractHttpStatusFromPlaywrightError(error);
  if (playwrightStatus) {
    return playwrightStatus;
  }

  return is4xxError(error);
}

/**
 * Handle Playwright navigation error with proper ArticleSkipError throwing.
 */
export function handlePlaywrightNavigationError(
  error: unknown,
  _url: string,
): never {
  const statusCode = getHttpStatusCode(error);

  if (statusCode && statusCode >= 400 && statusCode < 500) {
    throw new ArticleSkipError(
      `Failed to extract image from URL: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      statusCode,
      error instanceof Error ? error : undefined,
    );
  }

  // If we get here, it's a non-4xx error
  throw error;
}
