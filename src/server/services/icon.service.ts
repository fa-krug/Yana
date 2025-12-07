/**
 * Icon service for fetching feed icons and favicons.
 *
 * Handles different feed types: RSS feeds, Reddit subreddits, YouTube channels.
 * Uses asynchronous queue for icon fetching.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger";
import { enqueueTask } from "./taskQueue.service";
import type { Feed } from "../db/types";

/**
 * Fetch favicon URL from a website.
 */
export async function fetchFavicon(feedUrl: string): Promise<string | null> {
  try {
    // Extract base URL from the feed URL
    const parsed = new URL(feedUrl);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;

    logger.info({ baseUrl }, "Fetching favicon");

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    };

    // Try to fetch the homepage and look for favicon in HTML
    try {
      const response = await axios.get(baseUrl, { headers, timeout: 10000 });
      const $ = cheerio.load(response.data);

      // Look for various favicon link tags
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
          let faviconUrl = href;
          // Handle relative URLs
          if (
            !faviconUrl.startsWith("http://") &&
            !faviconUrl.startsWith("https://")
          ) {
            faviconUrl = new URL(faviconUrl, baseUrl).toString();
          }
          logger.info({ faviconUrl }, "Found favicon in HTML");
          return faviconUrl;
        }
      }
    } catch (error) {
      logger.debug({ error, baseUrl }, "Could not fetch homepage for favicon");
    }

    // Fall back to checking /favicon.ico
    const faviconIcoUrl = `${baseUrl}/favicon.ico`;
    try {
      const response = await axios.head(faviconIcoUrl, {
        headers,
        timeout: 5000,
      });
      if (response.status === 200) {
        logger.info({ faviconIcoUrl }, "Found favicon.ico");
        return faviconIcoUrl;
      }
    } catch (error) {
      logger.debug({ error, faviconIcoUrl }, "Could not fetch favicon.ico");
    }

    logger.warn({ baseUrl }, "No favicon found");
    return null;
  } catch (error) {
    logger.error({ error, feedUrl }, "Error fetching favicon");
    return null;
  }
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

      const iconUrl =
        response.data?.data?.icon_img ||
        response.data?.data?.community_icon ||
        null;

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
 * Fetch YouTube channel icon.
 */
export async function fetchYouTubeIcon(
  identifier: string,
): Promise<string | null> {
  try {
    logger.info({ identifier }, "Fetching YouTube icon");

    // Placeholder - will be implemented with YouTube API
    // For now, return null
    logger.warn(
      { identifier },
      "YouTube icon fetching not yet fully implemented",
    );
    return null;
  } catch (error) {
    logger.error({ error, identifier }, "Error fetching YouTube icon");
    return null;
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
      return await fetchYouTubeIcon(feed.identifier);
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
export async function queueIconFetch(feedId: number): Promise<void> {
  try {
    await enqueueTask("fetch_icon", { feedId });
    logger.info({ feedId }, "Icon fetch enqueued");
  } catch (error) {
    logger.error({ error, feedId }, "Failed to enqueue icon fetch");
  }
}

/**
 * Process icon fetch (called by worker).
 */
export async function processIconFetch(feedId: number): Promise<void> {
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

  // Skip if icon already exists
  if (feed.icon) {
    logger.debug({ feedId }, "Feed already has icon, skipping");
    return;
  }

  // Fetch icon
  const iconUrl = await fetchFeedIcon(feed);

  if (iconUrl) {
    // Update feed with icon
    await db
      .update(feeds)
      .set({ icon: iconUrl, updatedAt: new Date() })
      .where(eq(feeds.id, feedId));

    logger.info({ feedId, iconUrl }, "Feed icon updated");
  } else {
    logger.warn({ feedId }, "No icon found for feed");
  }
}
