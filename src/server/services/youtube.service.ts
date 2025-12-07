/**
 * YouTube service.
 *
 * Handles YouTube API authentication and credential testing.
 */

import axios from "axios";
import { logger } from "../utils/logger";

export interface YouTubeCredentials {
  apiKey: string;
}

export interface YouTubeTestResult {
  success: boolean;
  errors?: {
    apiKey?: string;
    general?: string;
  };
}

/**
 * Test YouTube credentials by attempting to make a simple API call.
 */
export async function testYouTubeCredentials(
  credentials: YouTubeCredentials,
): Promise<YouTubeTestResult> {
  const errors: YouTubeTestResult["errors"] = {};

  // Validate required fields
  if (!credentials.apiKey || credentials.apiKey.trim() === "") {
    errors.apiKey = "API Key is required";
    return { success: false, errors };
  }

  try {
    // Test credentials by making a simple API call to list channels
    // Using a well-known channel ID (YouTube's own channel) for testing
    const testChannelId = "UCBR8-60-B28hp2BmDPdntcQ"; // YouTube's official channel
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "id",
          id: testChannelId,
          key: credentials.apiKey,
        },
        timeout: 10000, // 10 second timeout
      },
    );

    // If we get a successful response, credentials are valid
    if (response.status === 200) {
      // Check if the API returned an error in the response body
      if (response.data.error) {
        const error = response.data.error;
        if (error.code === 400) {
          errors.apiKey = "Invalid API Key";
          errors.general = "Invalid API Key";
        } else if (error.code === 403) {
          errors.apiKey = "API Key is restricted or quota exceeded";
          errors.general =
            "API Key is restricted or quota exceeded. Check API restrictions in Google Cloud Console.";
        } else {
          errors.general = error.message || "YouTube API error";
        }
        return { success: false, errors };
      }

      // Success - API key is valid
      logger.info("YouTube credentials test successful");
      return { success: true };
    }

    // Unexpected response
    errors.general = "Invalid response from YouTube API";
    return { success: false, errors };
  } catch (error) {
    logger.warn({ error }, "YouTube credentials test failed");

    if (axios.isAxiosError(error)) {
      // Handle specific HTTP errors
      if (error.response?.status === 400) {
        errors.apiKey = "Invalid API Key";
        errors.general = "Invalid API Key";
      } else if (error.response?.status === 403) {
        // Check if it's a quota error or permission error
        const errorData = error.response.data;
        if (errorData?.error?.errors?.[0]?.reason === "quotaExceeded") {
          errors.general =
            "YouTube API quota exceeded. Please try again later.";
        } else if (
          errorData?.error?.errors?.[0]?.reason === "accessNotConfigured"
        ) {
          errors.general =
            "YouTube Data API v3 is not enabled. Enable it in Google Cloud Console.";
        } else {
          errors.apiKey = "API Key is restricted or invalid";
          errors.general =
            "API Key is restricted or invalid. Check API restrictions in Google Cloud Console.";
        }
      } else if (error.response?.status === 401) {
        errors.apiKey = "Invalid API Key";
        errors.general = "Invalid API Key";
      } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        errors.general =
          "Connection timeout. Please check your internet connection.";
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        errors.general =
          "Cannot connect to YouTube API. Please check your internet connection.";
      } else {
        // Other HTTP errors
        const errorData = error.response?.data;
        errors.general =
          errorData?.error?.message ||
          `YouTube API error: ${error.response?.statusText || error.message}`;
      }
    } else {
      // Non-Axios errors
      errors.general = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return { success: false, errors };
  }
}
