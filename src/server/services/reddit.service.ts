/**
 * Reddit service.
 *
 * Handles Reddit API authentication and credential testing.
 */

import axios from "axios";
import { logger } from "../utils/logger";

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

export interface RedditTestResult {
  success: boolean;
  errors?: {
    clientId?: string;
    clientSecret?: string;
    userAgent?: string;
    general?: string;
  };
}

/**
 * Test Reddit credentials by attempting to authenticate with Reddit's OAuth API.
 */
export async function testRedditCredentials(
  credentials: RedditCredentials,
): Promise<RedditTestResult> {
  const errors: RedditTestResult["errors"] = {};

  // Validate required fields
  if (!credentials.clientId || credentials.clientId.trim() === "") {
    errors.clientId = "Client ID is required";
  }

  if (!credentials.clientSecret || credentials.clientSecret.trim() === "") {
    errors.clientSecret = "Client Secret is required";
  }

  if (!credentials.userAgent || credentials.userAgent.trim() === "") {
    errors.userAgent = "User Agent is required";
  }

  // If basic validation fails, return early
  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  try {
    // Test credentials by attempting to get an access token from Reddit's OAuth endpoint
    // Reddit uses OAuth2 client credentials flow for script apps
    const authUrl = "https://www.reddit.com/api/v1/access_token";
    const authData = new URLSearchParams({
      grant_type: "client_credentials",
    });

    const response = await axios.post(authUrl, authData, {
      auth: {
        username: credentials.clientId,
        password: credentials.clientSecret,
      },
      headers: {
        "User-Agent": credentials.userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000, // 10 second timeout
    });

    // If we get a successful response with an access token, credentials are valid
    if (response.status === 200 && response.data?.access_token) {
      logger.info("Reddit credentials test successful");
      return { success: true };
    }

    // Unexpected response format
    errors.general = "Invalid response from Reddit API";
    return { success: false, errors };
  } catch (error) {
    logger.warn({ error }, "Reddit credentials test failed");

    if (axios.isAxiosError(error)) {
      // Handle specific HTTP errors
      if (error.response?.status === 401) {
        // Unauthorized - invalid credentials
        errors.general = "Invalid Client ID or Client Secret";
        // Try to determine which field is wrong (though Reddit doesn't specify)
        // We'll mark both as potentially wrong
        errors.clientId = "Invalid Client ID or Client Secret";
        errors.clientSecret = "Invalid Client ID or Client Secret";
      } else if (error.response?.status === 403) {
        // Forbidden - credentials might be valid but app might be misconfigured
        errors.general =
          "Reddit app configuration issue. Check app settings on Reddit.";
      } else if (error.response?.status === 429) {
        // Rate limited
        errors.general = "Rate limited by Reddit. Please try again later.";
      } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        // Timeout
        errors.general =
          "Connection timeout. Please check your internet connection.";
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        // Network error
        errors.general =
          "Cannot connect to Reddit API. Please check your internet connection.";
      } else {
        // Other HTTP errors
        errors.general =
          error.response?.data?.message ||
          `Reddit API error: ${error.response?.statusText || error.message}`;
      }
    } else {
      // Non-Axios errors
      errors.general = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return { success: false, errors };
  }
}
