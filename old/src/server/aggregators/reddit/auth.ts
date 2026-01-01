/**
 * Reddit OAuth authentication utilities.
 */

import axios from "axios";

import { getUserSettings } from "@server/services/userSettings.service";
import { logger } from "@server/utils/logger";

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
 * Request access token from Reddit API.
 */
async function requestAccessToken(
  settings: Awaited<ReturnType<typeof getUserSettings>>,
): Promise<import("axios").AxiosResponse> {
  const authUrl = "https://www.reddit.com/api/v1/access_token";
  const authData = new URLSearchParams({ grant_type: "client_credentials" });
  return axios.post(authUrl, authData, {
    auth: {
      username: settings.redditClientId ?? "",
      password: settings.redditClientSecret ?? "",
    },
    headers: {
      "User-Agent": settings.redditUserAgent || "Yana/1.0",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 10000,
  });
}

/**
 * Handle Reddit OAuth error.
 */
function handleRedditOAuthError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401)
      throw new Error(
        "Invalid Reddit API credentials. Please check your Client ID and Client Secret.",
      );
    if (status === 403)
      throw new Error(
        "Reddit app configuration issue. Check your app settings on Reddit.",
      );
    if (status === 429)
      throw new Error("Rate limited by Reddit. Please try again later.");
    throw new Error(
      `Reddit OAuth error: ${error.response?.statusText || error.message}`,
    );
  }
  throw new Error(
    `Failed to get Reddit access token: ${error instanceof Error ? error.message : String(error)}`,
  );
}

/**
 * Get Reddit OAuth2 access token.
 * Implements client credentials flow with token caching.
 */
export async function getRedditAccessToken(userId: number): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const settings = await getUserSettings(userId);
  if (!settings.redditEnabled)
    throw new Error(
      "Reddit is not enabled. Please enable Reddit in your settings.",
    );
  if (!settings.redditClientId || !settings.redditClientSecret)
    throw new Error("Reddit API credentials not configured.");

  try {
    const response = await requestAccessToken(settings);
    if (
      response.status === 200 &&
      response.data?.access_token &&
      response.data?.token_type === "bearer"
    ) {
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      const expiresAt = Date.now() + expiresIn * 1000 - 60000;
      tokenCache.set(userId, { token, expiresAt });
      logger.debug(
        { userId, expiresIn },
        "Reddit OAuth token obtained and cached",
      );
      return token;
    }
    throw new Error("Invalid response from Reddit OAuth API");
  } catch (error) {
    handleRedditOAuthError(error);
  }
}
