/**
 * YouTube channel data transformation utilities.
 *
 * Extracts and transforms raw YouTube API responses into structured channel results.
 * Handles optional chaining and fallback values in a single-responsibility pattern.
 */

import type { YouTubeChannelSearchResult } from "./youtube.service"; // eslint-disable-line import/no-cycle

/**
 * Extract channel handle from snippet data.
 * Tries customUrl first, then handle, with "@" prefix removal.
 */
export function extractChannelHandle(snippet: any): string | null {
  const customUrl = snippet?.customUrl;
  if (customUrl) {
    return customUrl.replace("@", "");
  }

  const handle = snippet?.handle;
  if (handle) {
    return handle.replace("@", "");
  }

  return null;
}

/**
 * Extract thumbnail URL from snippet thumbnails.
 * Prefers high quality, falls back to default.
 */
export function extractThumbnailUrl(thumbnails: any): string | null {
  const highUrl = thumbnails?.high?.url;
  if (highUrl) {
    return highUrl;
  }

  const defaultUrl = thumbnails?.default?.url;
  if (defaultUrl) {
    return defaultUrl;
  }

  return null;
}

/**
 * Extract subscriber count from statistics data.
 * Returns 0 if not available or if parsing fails.
 */
export function extractSubscriberCount(statistics: any): number {
  const count = statistics?.subscriberCount;
  if (count) {
    return parseInt(String(count), 10);
  }
  return 0;
}

/**
 * Transform raw YouTube channel data into a structured result.
 * Handles cases where detail fetch may have failed (channelDetails undefined).
 */
export function transformChannelDetails(
  searchItem: any,
  searchSnippet: any,
  channelDetails?: any,
): YouTubeChannelSearchResult {
  const channelSnippet = channelDetails?.snippet;
  const statistics = channelDetails?.statistics;

  const handle = extractChannelHandle(channelSnippet);
  const subscriberCount = extractSubscriberCount(statistics);
  const thumbnailUrl = extractThumbnailUrl(searchSnippet.thumbnails);

  return {
    channelId: searchItem.id.channelId,
    title: searchSnippet.title || "",
    description: searchSnippet.description || "",
    thumbnailUrl,
    subscriberCount,
    handle,
  };
}
