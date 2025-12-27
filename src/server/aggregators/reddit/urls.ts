/**
 * Reddit URL utilities.
 */

import axios from "axios";

import { logger } from "@server/utils/logger";

import { getRedditAccessToken } from "./auth";

/**
 * Reddit subreddit info interface.
 */
interface RedditSubredditInfo {
  data: {
    display_name: string;
    icon_img: string;
    community_icon: string;
    header_img: string | null;
  };
}

/**
 * Decode HTML entities in URLs.
 * Converts &amp; to &, &lt; to <, &gt; to >, &quot; to ", &#39; to '.
 */
export function decodeHtmlEntitiesInUrl(url: string): string {
  return url
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Fix redditmedia.com and external-preview.redd.it URLs by replacing &amp; with &.
 * Also decodes HTML entities in the URL first.
 */
export function fixRedditMediaUrl(url: string | null): string | null {
  if (!url) return null;
  // Decode HTML entities first
  const decoded = decodeHtmlEntitiesInUrl(url);
  if (
    decoded.includes("styles.redditmedia.com") ||
    decoded.includes("external-preview.redd.it")
  ) {
    return decoded.replace(/&amp;/g, "&");
  }
  return decoded;
}

/**
 * Convert Reddit preview.redd.it URLs to i.redd.it URLs when possible.
 * Reddit's i.redd.it CDN is more accessible than preview.redd.it.
 */
export function convertRedditPreviewUrl(url: string): string {
  try {
    // Convert preview.redd.it to i.redd.it
    if (url.includes("preview.redd.it")) {
      const urlObj = new URL(url);
      // Extract the filename from the path
      const pathParts = urlObj.pathname.split("/");
      const filename = pathParts[pathParts.length - 1];

      // Build i.redd.it URL (remove query params as they're often signatures)
      const newUrl = `https://i.redd.it/${filename}`;
      logger.debug(
        { original: url, converted: newUrl },
        "Converting Reddit preview URL",
      );
      return newUrl;
    }
    return url;
  } catch (error) {
    logger.debug({ error, url }, "Failed to convert Reddit preview URL");
    return url;
  }
}

/**
 * Get appropriate referer header for Reddit URLs.
 * For Reddit URLs, use reddit.com. For others, use the domain of the URL.
 */
export function getRedditRefererHeader(url: string): string {
  try {
    const urlObj = new URL(url);

    // Special handling for Reddit domains
    if (
      urlObj.hostname.includes("redd.it") ||
      urlObj.hostname.includes("reddit.com")
    ) {
      return "https://www.reddit.com";
    }

    // For other domains, use the origin
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    logger.debug({ error, url }, "Failed to determine referer");
    return "https://www.reddit.com"; // Safe fallback for Reddit
  }
}

/**
 * Extract subreddit name from URL or identifier.
 */
export function normalizeSubreddit(identifier: string): string {
  identifier = identifier.trim();

  // Extract from URL
  const urlMatch = /(?:reddit\.com)?\/r\/(\w+)/.exec(identifier);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Remove r/ or /r/ prefix
  if (identifier.startsWith("/r/")) {
    return identifier.slice(3);
  }
  if (identifier.startsWith("r/")) {
    return identifier.slice(2);
  }

  return identifier;
}

/**
 * Extract post ID and subreddit from Reddit URL.
 * Format: https://reddit.com/r/{subreddit}/comments/{postId}/...
 */
export function extractPostInfoFromUrl(url: string): {
  subreddit: string | null;
  postId: string | null;
} {
  const match = /\/r\/(\w+)\/comments\/([a-zA-Z0-9]+)/.exec(url);
  return match
    ? { subreddit: match[1], postId: match[2] }
    : { subreddit: null, postId: null };
}

/**
 * Validate subreddit name.
 */
export function validateSubreddit(subreddit: string): {
  valid: boolean;
  error?: string;
} {
  if (!subreddit) {
    return { valid: false, error: "Subreddit is required" };
  }

  // Subreddit names: 2-21 characters, alphanumeric and underscores only
  if (!/^\w{2,21}$/.test(subreddit)) {
    return {
      valid: false,
      error:
        "Invalid subreddit name. Use 2-21 alphanumeric characters or underscores.",
    };
  }

  return { valid: true };
}

/**
 * Fetch subreddit information including icon.
 */
export async function fetchSubredditInfo(
  subreddit: string,
  userId: number,
): Promise<{ iconUrl: string | null }> {
  try {
    const accessToken = await getRedditAccessToken(userId);
    const url = `https://oauth.reddit.com/r/${subreddit}/about`;
    const response = await axios.get<RedditSubredditInfo>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });

    const subredditData = response.data.data;
    // Prefer icon_img, fall back to community_icon
    // Decode HTML entities before fixing the URL
    const rawIconUrl =
      subredditData.icon_img || subredditData.community_icon || null;
    const iconUrl = rawIconUrl
      ? fixRedditMediaUrl(decodeHtmlEntitiesInUrl(rawIconUrl))
      : null;

    if (iconUrl) {
      logger.debug({ subreddit, iconUrl }, "Fetched subreddit icon");
    }

    return { iconUrl };
  } catch (error) {
    logger.warn({ error, subreddit }, "Failed to fetch subreddit info");
    return { iconUrl: null };
  }
}

/**
 * Extract URLs from Reddit post text (selftext).
 * Handles both plain URLs and markdown links [text](url).
 * Decodes HTML entities in extracted URLs.
 */
export function extractUrlsFromText(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];

  // Pattern for markdown links: [text](url)
  const markdownLinkPattern = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = markdownLinkPattern.exec(text)) !== null) {
    urls.push(decodeHtmlEntitiesInUrl(match[2]));
  }

  // Pattern for plain URLs: http:// or https://
  // This regex matches URLs but avoids matching URLs already found in markdown links
  const plainUrlPattern = /(?<!\]\()(https?:\/\/[^\s)]+)/g;
  while ((match = plainUrlPattern.exec(text)) !== null) {
    // Remove trailing punctuation that might be part of the sentence
    const url = match[1].replace(/[.,;:!?)]+$/, "");
    const decodedUrl = decodeHtmlEntitiesInUrl(url);
    if (!urls.includes(decodedUrl)) {
      urls.push(decodedUrl);
    }
  }

  return urls;
}
