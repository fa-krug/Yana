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
 * Fetch YouTube channel icon.
 */
export async function fetchYouTubeIcon(feed: Feed): Promise<string | null> {
  try {
    logger.info(
      { identifier: feed.identifier, feedId: feed.id },
      "Fetching YouTube icon",
    );

    // Get API key from user settings
    if (!feed.userId) {
      logger.warn(
        { feedId: feed.id },
        "Feed has no userId, cannot fetch YouTube icon",
      );
      return null;
    }

    const { getUserSettings } = await import("./userSettings.service");
    const settings = await getUserSettings(feed.userId);

    if (
      !settings.youtubeEnabled ||
      !settings.youtubeApiKey ||
      settings.youtubeApiKey.trim() === ""
    ) {
      logger.warn(
        { feedId: feed.id },
        "YouTube API key not configured, cannot fetch icon",
      );
      // Return default YouTube favicon as fallback
      return "https://www.youtube.com/s/desktop/favicon.ico";
    }

    const apiKey = settings.youtubeApiKey;

    // Resolve channel identifier to channel ID
    const { resolveChannelId } = await import("../aggregators/youtube");
    const { channelId, error } = await resolveChannelId(
      feed.identifier,
      apiKey,
    );

    if (error || !channelId) {
      logger.warn(
        { identifier: feed.identifier, error },
        "Could not resolve YouTube channel ID for icon",
      );
      // Return default YouTube favicon as fallback
      return "https://www.youtube.com/s/desktop/favicon.ico";
    }

    // Fetch channel thumbnail from YouTube API
    try {
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            part: "snippet",
            id: channelId,
            key: apiKey,
          },
          timeout: 10000,
        },
      );

      const items = response.data?.items;
      if (items && items.length > 0) {
        const snippet = items[0].snippet;
        const thumbnails = snippet?.thumbnails;

        if (thumbnails) {
          // Get highest quality thumbnail (prefer high quality first)
          for (const quality of ["high", "medium", "default"] as const) {
            if (thumbnails[quality]?.url) {
              const iconUrl = thumbnails[quality].url;
              logger.info(
                { channelId, iconUrl, quality },
                "Found YouTube channel icon",
              );
              return iconUrl;
            }
          }
        }
      }

      logger.warn({ channelId }, "No thumbnail found for YouTube channel");
      // Return default YouTube favicon as fallback
      return "https://www.youtube.com/s/desktop/favicon.ico";
    } catch (apiError) {
      logger.warn(
        { error: apiError, channelId },
        "Error fetching YouTube channel thumbnail from API",
      );
      // Return default YouTube favicon as fallback
      return "https://www.youtube.com/s/desktop/favicon.ico";
    }
  } catch (error) {
    logger.error({ error, feedId: feed.id }, "Error fetching YouTube icon");
    // Return default YouTube favicon as fallback
    return "https://www.youtube.com/s/desktop/favicon.ico";
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
