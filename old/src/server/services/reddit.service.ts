/**
 * Reddit service.
 *
 * Handles Reddit API authentication and credential testing.
 */

import axios from "axios";

import { logger } from "../utils/logger";

import {
  validateRequiredFields,
  handleAxiosError,
  handleUnexpectedError,
} from "./reddit-credential-handlers";

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
  // Validate required fields
  const validationErrors = validateRequiredFields(credentials);
  if (validationErrors) {
    return { success: false, errors: validationErrors };
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
      timeout: 10000,
    });

    // If we get a successful response with an access token, credentials are valid
    if (response.status === 200 && response.data?.access_token) {
      logger.info("Reddit credentials test successful");
      return { success: true };
    }

    // Unexpected response format
    return {
      success: false,
      errors: { general: "Invalid response from Reddit API" },
    };
  } catch (error) {
    logger.warn({ error }, "Reddit credentials test failed");

    const errors = axios.isAxiosError(error)
      ? handleAxiosError(error)
      : handleUnexpectedError(error);

    return { success: false, errors };
  }
}

export interface SubredditSearchResult {
  name: string;
  displayName: string;
  title: string;
  description: string;
  subscribers: number;
  over18: boolean;
}

/**
 * Search Reddit subreddits using Reddit's public API.
 * Returns a list of subreddits matching the search query.
 */
export async function searchRedditSubreddits(
  query: string,
  limit: number = 25,
): Promise<SubredditSearchResult[]> {
  try {
    const url = "https://www.reddit.com/subreddits/search.json";
    const response = await axios.get(url, {
      params: {
        q: query,
        limit: Math.min(limit, 100), // Reddit API max is 100
        sort: "relevance",
      },
      headers: {
        "User-Agent": "Yana/1.0",
      },
      timeout: 10000,
    });

    const subreddits: SubredditSearchResult[] = [];

    if (response.data?.data?.children) {
      for (const child of response.data.data.children) {
        const data = child.data;
        if (data?.display_name) {
          subreddits.push({
            name: data.display_name,
            displayName: data.display_name,
            title: data.title || data.display_name,
            description: data.public_description || "",
            subscribers: data.subscribers || 0,
            over18: data.over18 || false,
          });
        }
      }
    }

    logger.info(
      { query, count: subreddits.length },
      "Successfully searched Reddit subreddits",
    );
    return subreddits;
  } catch (error) {
    logger.error({ error, query }, "Error searching Reddit subreddits");
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error("Rate limited by Reddit. Please try again later.");
      }
      throw new Error(
        `Reddit API error: ${error.response?.statusText || error.message}`,
      );
    }
    throw error;
  }
}
