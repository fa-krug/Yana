/**
 * Icon service for fetching feed icons and favicons.
 *
 * Handles different feed types: RSS feeds, Reddit subreddits, YouTube channels.
 * Uses asynchronous queue for icon fetching.
 */

import axios from "axios";
import * as cheerio from "cheerio";

import type { Feed } from "../db/types";
import { logger } from "../utils/logger";

import { enqueueTask } from "./taskQueue.service";

/**
 * Extract favicon URL from HTML content.
 */
function extractFaviconFromHtml(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): string | null {
  const iconSelectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];

  for (const selector of iconSelectors) {
    const iconLink = $(selector).first();
    const href = iconLink.attr("href");
    if (href) {
      if (!href.startsWith("http://") && !href.startsWith("https://")) {
        return new URL(href, baseUrl).toString();
      }
      return href;
    }
  }
  return null;
}

/**
 * Check if /favicon.ico exists.
 */
async function checkFaviconIco(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const faviconIcoUrl = `${baseUrl}/favicon.ico`;
  try {
    const response = await axios.head(faviconIcoUrl, {
      headers,
      timeout: 5000,
    });
    if (response.status === 200) return faviconIcoUrl;
  } catch {
    // Ignore error
  }
  return null;
}

/**
 * Fetch favicon URL from a website.
 */
export async function fetchFavicon(feedUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(feedUrl);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    };

    try {
      const response = await axios.get(baseUrl, { headers, timeout: 10000 });
      const faviconUrl = extractFaviconFromHtml(
        cheerio.load(response.data),
        baseUrl,
      );
      if (faviconUrl) return faviconUrl;
    } catch (error) {
      logger.debug({ error, baseUrl }, "Could not fetch homepage for favicon");
    }

    const faviconIcoUrl = await checkFaviconIco(baseUrl, headers);
    if (faviconIcoUrl) return faviconIcoUrl;

    logger.warn({ baseUrl }, "No favicon found");
    return null;
  } catch (error) {
    logger.error({ error, feedUrl }, "Error fetching favicon");
    return null;
  }
}

/**
 * Fix redditmedia.com and external-preview.redd.it URLs by replacing &amp; with &.
 */
function fixRedditMediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (
    url.includes("styles.redditmedia.com") ||
    url.includes("external-preview.redd.it")
  ) {
    return url.replace(/&amp;/g, "&");
  }
  return url;
}

/**
 * Fetch Reddit subreddit icon.
 */
export async function fetchRedditIcon(
  identifier: string,
): Promise<string | null> {
  try {
    // Remove r/ prefix if present
    const subreddit = identifier.replace(/^r\//, "");

    // Reddit API endpoint for subreddit info
    const apiUrl = `https://www.reddit.com/r/${subreddit}/about.json`;

    logger.info({ subreddit }, "Fetching Reddit icon");

    try {
      const response = await axios.get(apiUrl, {
        headers: {
          "User-Agent": "Yana/1.0",
        },
        timeout: 10000,
      });

      const iconUrl = fixRedditMediaUrl(
        response.data?.data?.icon_img ||
          response.data?.data?.community_icon ||
          null,
      );

      if (iconUrl) {
        logger.info({ subreddit, iconUrl }, "Found Reddit icon");
        return iconUrl;
      }
    } catch (error) {
      logger.debug(
        { error, subreddit },
        "Could not fetch Reddit icon from API",
      );
    }

    logger.warn({ subreddit }, "No Reddit icon found");
    return null;
  } catch (error) {
    logger.error({ error, identifier }, "Error fetching Reddit icon");
    return null;
  }
}

/**
 * Get YouTube API key from user settings.
 */
async function getYouTubeApiKey(userId: number): Promise<string | null> {
  const { getUserSettings } = await import("./userSettings.service");
  const settings = await getUserSettings(userId);
  if (
    !settings.youtubeEnabled ||
    !settings.youtubeApiKey ||
    settings.youtubeApiKey.trim() === ""
  ) {
    return null;
  }
  return settings.youtubeApiKey;
}

/**
 * Resolve YouTube channel identifier to ID.
 */
async function resolveChannelIdHelper(
  identifier: string,
  apiKey: string,
): Promise<string | null> {
  const { resolveChannelId } = await import("../aggregators/youtube");
  const { channelId, error } = await resolveChannelId(identifier, apiKey);
  if (error || !channelId) {
    logger.warn({ identifier, error }, "Could not resolve YouTube channel ID");
    return null;
  }
  return channelId;
}

/**
 * Fetch YouTube channel icon.
 */
export async function fetchYouTubeIcon(feed: Feed): Promise<string | null> {
  const defaultIcon = "https://www.youtube.com/s/desktop/favicon.ico";
  if (!feed.userId) return null;

  try {
    const apiKey = await getYouTubeApiKey(feed.userId);
    if (!apiKey) return defaultIcon;

    const channelId = await resolveChannelIdHelper(feed.identifier, apiKey);
    if (!channelId) return defaultIcon;

    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: { part: "snippet", id: channelId, key: apiKey },
        timeout: 10000,
      },
    );

    const thumbnails = response.data?.items?.[0]?.snippet?.thumbnails;
    if (thumbnails) {
      for (const quality of ["high", "medium", "default"] as const) {
        if (thumbnails[quality]?.url) return thumbnails[quality].url;
      }
    }

    return defaultIcon;
  } catch (error) {
    logger.error({ error, feedId: feed.id }, "Error fetching YouTube icon");
    return defaultIcon;
  }
}

/**
 * Fetch icon for a feed (determines type and calls appropriate function).
 */
export async function fetchFeedIcon(feed: Feed): Promise<string | null> {
  try {
    if (feed.feedType === "reddit") {
      return await fetchRedditIcon(feed.identifier);
    } else if (feed.feedType === "youtube") {
      return await fetchYouTubeIcon(feed);
    } else {
      // Regular RSS feed
      return await fetchFavicon(feed.identifier);
    }
  } catch (error) {
    logger.error({ error, feedId: feed.id }, "Error fetching feed icon");
    return null;
  }
}

/**
 * Queue icon fetch task (asynchronous).
 */
export async function queueIconFetch(
  feedId: number,
  force: boolean = false,
): Promise<void> {
  try {
    await enqueueTask("fetch_icon", { feedId, force });
    logger.info({ feedId, force }, "Icon fetch enqueued");
  } catch (error) {
    logger.error({ error, feedId }, "Failed to enqueue icon fetch");
  }
}

/**
 * Process icon fetch (converts to base64 and stores).
 * Can be called directly (synchronously) or by worker.
 */
export async function processIconFetch(
  feedId: number,
  force: boolean = false,
): Promise<void> {
  const { db, feeds } = await import("../db");
  const { eq } = await import("drizzle-orm");

  const [feed] = await db
    .select()
    .from(feeds)
    .where(eq(feeds.id, feedId))
    .limit(1);

  if (!feed) {
    throw new Error(`Feed with id ${feedId} not found`);
  }

  // Skip if icon already exists and not forcing refresh
  if (feed.icon && !force) {
    logger.debug({ feedId }, "Feed already has icon, skipping");
    return;
  }

  // Fetch icon URL
  const iconUrl = await fetchFeedIcon(feed);

  if (iconUrl) {
    // Convert to base64
    const { convertThumbnailUrlToBase64 } =
      await import("../aggregators/base/utils");
    const iconBase64 = await convertThumbnailUrlToBase64(iconUrl);

    if (iconBase64) {
      // Update feed with icon as base64
      await db
        .update(feeds)
        .set({ icon: iconBase64, updatedAt: new Date() })
        .where(eq(feeds.id, feedId));

      logger.info({ feedId, force }, "Feed icon updated as base64");
    } else {
      logger.warn({ feedId, iconUrl }, "Failed to convert feed icon to base64");
    }
  } else {
    logger.warn({ feedId }, "No icon found for feed");
  }
}
