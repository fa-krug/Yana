/**
 * YouTube API error handling utilities.
 */

import axios, { AxiosError } from "axios";

/**
 * Custom error class for YouTube API errors.
 */
export class YouTubeAPIError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "YouTubeAPIError";
    this.cause = cause;
  }
}

/**
 * Get message for specific YouTube API error reason.
 */
function getReasonMessage(reason: string): string | null {
  const reasonMap: Record<string, string> = {
    quotaExceeded: "YouTube API quota exceeded. Please try again later or check your quota in Google Cloud Console.",
    accessNotConfigured: "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.",
    forbidden: "API key is restricted or invalid. Check API key restrictions in Google Cloud Console.",
  };
  return reasonMap[reason] || null;
}

/**
 * Get message for specific HTTP status code.
 */
function getStatusMessage(status?: number): string | null {
  const statusMap: Record<number, string> = {
    403: "YouTube API access forbidden. Check your API key permissions and restrictions.",
    404: "YouTube resource not found. Check the channel identifier or video ID.",
    429: "YouTube API rate limit exceeded. Please try again later.",
    400: "Invalid YouTube API request. Check your channel identifier format.",
  };
  return status ? (statusMap[status] || null) : null;
}

/**
 * Extract a user-friendly error message from a YouTube API error.
 */
export function getYouTubeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const errorData = axiosError.response?.data as { error?: { errors?: Array<{ reason?: string }> } } | undefined;

    if (errorData?.error?.errors?.[0]?.reason) {
      const msg = getReasonMessage(errorData.error.errors[0].reason);
      if (msg) return msg;
    }

    const statusMsg = getStatusMessage(axiosError.response?.status);
    if (statusMsg) return statusMsg;

    return `YouTube API error: ${axiosError.message || "Unknown error"}`;
  }

  return error instanceof Error ? error.message : "Unknown YouTube API error";
}
