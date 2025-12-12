/**
 * Reddit OAuth authentication utilities.
 */

import axios from "axios";
import { logger } from "@server/utils/logger";
import { getUserSettings } from "@server/services/userSettings.service";

/**
 * Token cache entry.
 */
interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

/**
 * In-memory token cache per user.
 */
const tokenCache = new Map<number, TokenCacheEntry>();

/**
 * Get Reddit OAuth2 access token.
 * Implements client credentials flow with token caching.
 */
export async function getRedditAccessToken(userId: number): Promise<string> {
  // Check cache first
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    // Token still valid (refresh 1 minute before expiration)
    return cached.token;
  }

  // Get credentials from user settings
  const settings = await getUserSettings(userId);

  // Validate Reddit is enabled
  if (!settings.redditEnabled) {
    throw new Error(
      "Reddit is not enabled. Please enable Reddit in your settings and configure API credentials.",
    );
  }

  // Validate credentials are present
  if (!settings.redditClientId || !settings.redditClientSecret) {
    throw new Error(
      "Reddit API credentials not configured. Please set Client ID and Client Secret in your settings.",
    );
  }

  const userAgent = settings.redditUserAgent || "Yana/1.0";

  try {
    // Request access token using OAuth2 client credentials flow
    const authUrl = "https://www.reddit.com/api/v1/access_token";
    const authData = new URLSearchParams({
      grant_type: "client_credentials",
    });

    const response = await axios.post(authUrl, authData, {
      auth: {
        username: settings.redditClientId,
        password: settings.redditClientSecret,
      },
      headers: {
        "User-Agent": userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    });

    if (
      response.status === 200 &&
      response.data?.access_token &&
      response.data?.token_type === "bearer"
    ) {
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600; // Default to 1 hour
      const expiresAt = Date.now() + expiresIn * 1000 - 60000; // Refresh 1 min early

      // Cache the token
      tokenCache.set(userId, { token, expiresAt });

      logger.debug(
        { userId, expiresIn },
        "Reddit OAuth token obtained and cached",
      );

      return token;
    }

    throw new Error("Invalid response from Reddit OAuth API");
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error(
          "Invalid Reddit API credentials. Please check your Client ID and Client Secret.",
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "Reddit app configuration issue. Check your app settings on Reddit.",
        );
      }
      if (error.response?.status === 429) {
        throw new Error("Rate limited by Reddit. Please try again later.");
      }
      throw new Error(
        `Reddit OAuth error: ${error.response?.statusText || error.message}`,
      );
    }
    throw new Error(
      `Failed to get Reddit access token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
