/**
 * YouTube API error mapping and classification.
 *
 * Maps YouTube API error responses to user-friendly error messages.
 * Uses lookup tables instead of cascading conditionals to reduce complexity.
 */

import { AxiosError } from "axios";

/**
 * Map YouTube API error reasons to user-friendly messages.
 */
const ERROR_REASON_MAP: Record<string, string> = {
  quotaExceeded: "YouTube API quota exceeded. Please try again later.",
  accessNotConfigured:
    "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.",
  ipRefererBlocked:
    "API key is restricted by IP address or referer. Check API key restrictions in Google Cloud Console.",
  forbidden:
    "API key is restricted or invalid. Check API key restrictions in Google Cloud Console.",
};

interface YouTubeAPIError {
  error?: {
    message?: string;
    errors?: Array<{
      reason?: string;
    }>;
  };
}

/**
 * Extract error message from YouTube API error response.
 */
function extractErrorReason(error: AxiosError): string | undefined {
  const errorData = error.response?.data as YouTubeAPIError;
  return errorData?.error?.errors?.[0]?.reason;
}

/**
 * Extract error message from YouTube API error response.
 */
function extractErrorMessage(error: AxiosError): string | undefined {
  const errorData = error.response?.data as YouTubeAPIError;
  return errorData?.error?.message;
}

/**
 * Map a 403 Forbidden error to a user-friendly message.
 */
function handle403Error(error: AxiosError): string {
  const reason = extractErrorReason(error);

  // Use lookup table instead of cascading if-statements
  if (reason && reason in ERROR_REASON_MAP) {
    return ERROR_REASON_MAP[reason];
  }

  // Fallback to API message or generic message
  return (
    extractErrorMessage(error) ||
    "YouTube API access denied. Check API key restrictions in Google Cloud Console."
  );
}

/**
 * Map a 400 Bad Request error to a user-friendly message.
 */
function handle400Error(error: AxiosError): string {
  return extractErrorMessage(error) || "Invalid search query or API key.";
}

/**
 * Map a 401 Unauthorized error to a user-friendly message.
 */
function handle401Error(): string {
  return "Invalid YouTube API key.";
}

/**
 * Map a timeout error to a user-friendly message.
 */
function handleTimeoutError(): string {
  return "Connection timeout. Please check your internet connection.";
}

/**
 * Map a network error to a user-friendly message.
 */
function handleNetworkError(): string {
  return "Cannot connect to YouTube API. Please check your internet connection.";
}

/**
 * Map an unhandled Axios error to a user-friendly message.
 */
function handleGenericAxiosError(error: AxiosError): string {
  const errorData = error.response?.data as YouTubeAPIError;
  const errorMessage = errorData?.error?.message;

  return (
    errorMessage ||
    `YouTube API error: ${error.response?.statusText || error.message}`
  );
}

/**
 * Map an Axios error to a user-friendly error message.
 */
export function mapAxiosErrorToMessage(error: AxiosError): string {
  const status = error.response?.status;
  const code = error.code;

  // Handle specific HTTP status codes
  if (status === 403) {
    return handle403Error(error);
  }
  if (status === 400) {
    return handle400Error(error);
  }
  if (status === 401) {
    return handle401Error();
  }

  // Handle network errors
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
    return handleTimeoutError();
  }
  if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
    return handleNetworkError();
  }

  // Generic fallback
  return handleGenericAxiosError(error);
}
