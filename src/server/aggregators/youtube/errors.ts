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
 * Extract a user-friendly error message from a YouTube API error.
 */
export function getYouTubeErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const errorData = axiosError.response?.data as any;

    // Check for specific error reasons in the response
    if (errorData?.error?.errors?.[0]?.reason) {
      const reason = errorData.error.errors[0].reason;
      if (reason === "quotaExceeded") {
        return "YouTube API quota exceeded. Please try again later or check your quota in Google Cloud Console.";
      }
      if (reason === "accessNotConfigured") {
        return "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.";
      }
      if (reason === "forbidden") {
        return "API key is restricted or invalid. Check API key restrictions in Google Cloud Console.";
      }
    }

    // Handle specific status codes
    if (status === 403) {
      return "YouTube API access forbidden. Check your API key permissions and restrictions.";
    }
    if (status === 404) {
      return "YouTube resource not found. Check the channel identifier or video ID.";
    }
    if (status === 429) {
      return "YouTube API rate limit exceeded. Please try again later.";
    }
    if (status === 400) {
      return "Invalid YouTube API request. Check your channel identifier format.";
    }

    // Return generic error message
    return `YouTube API error: ${axiosError.message || "Unknown error"}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown YouTube API error";
}
