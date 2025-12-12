/**
 * Twitter/X utility functions.
 */

import { logger } from "@server/utils/logger";

/**
 * Twitter/X hostnames that should be treated as the same platform.
 */
const TWITTER_HOSTNAMES = [
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
] as const;

/**
 * Check if a URL is a Twitter/X URL.
 */
export function isTwitterUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return TWITTER_HOSTNAMES.includes(
      parsedUrl.hostname as (typeof TWITTER_HOSTNAMES)[number],
    );
  } catch (error) {
    logger.debug({ error, url }, "Failed to parse URL for Twitter check");
    return false;
  }
}

/**
 * Extract tweet ID from Twitter/X URL.
 * Returns null if the URL doesn't contain a valid tweet ID.
 */
export function extractTweetId(url: string): string | null {
  try {
    if (!isTwitterUrl(url)) {
      return null;
    }

    // Extract tweet ID from URL (e.g., /status/1234567890)
    const tweetIdMatch = url.match(/\/status\/(\d+)/);
    if (tweetIdMatch) {
      return tweetIdMatch[1];
    }

    return null;
  } catch (error) {
    logger.debug({ error, url }, "Failed to extract tweet ID");
    return null;
  }
}

/**
 * Normalize Twitter/X URL to use x.com domain.
 * This ensures consistency across the codebase.
 */
export function normalizeTwitterUrl(url: string): string {
  try {
    if (!isTwitterUrl(url)) {
      return url;
    }

    const parsedUrl = new URL(url);
    // Convert all Twitter domains to x.com
    if (
      parsedUrl.hostname === "twitter.com" ||
      parsedUrl.hostname === "www.twitter.com" ||
      parsedUrl.hostname === "mobile.twitter.com"
    ) {
      parsedUrl.hostname = "x.com";
      return parsedUrl.toString();
    }

    // Already x.com, return as-is
    return url;
  } catch (error) {
    logger.debug({ error, url }, "Failed to normalize Twitter URL");
    return url;
  }
}
