/**
 * YouTube channel resolution utilities.
 */

import axios from "axios";

import { logger } from "@server/utils/logger";

/**
 * YouTube search item interface.
 */
export interface YouTubeSearchItem {
  id: {
    channelId: string;
  };
  snippet: {
    title: string;
    customUrl?: string;
  };
}

/**
 * Validate that a channel ID exists.
 */
async function validateExistingChannelId(id: string, apiKey: string): Promise<string | null> {
  try {
    const response = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: { part: "id", id, key: apiKey },
    });
    return response.data.items?.length > 0 ? id : null;
  } catch (error) {
    logger.error({ error, id }, "YouTube API error validating channel ID");
    return null;
  }
}

/**
 * Extract handle or channel ID from YouTube URL.
 */
function extractFromUrl(identifier: string): { handle?: string; channelId?: string } | null {
  try {
    const urlStr = identifier.startsWith("http") ? identifier : `https://${identifier}`;
    const url = new URL(urlStr);
    const path = url.pathname.replace(/^\//, "").split("?")[0].split("#")[0];

    if (path.startsWith("@")) return { handle: path.slice(1).split("/")[0] };
    if (path.startsWith("c/") || path.startsWith("user/")) return { handle: path.split("/")[1] };
    if (path.startsWith("channel/")) return { channelId: path.split("/")[1] };

    const qId = url.searchParams.get("channel_id");
    if (qId) return { channelId: qId };

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve handle to channel ID via search.
 */
async function resolveViaSearch(handle: string, apiKey: string): Promise<string | null> {
  try {
    const q = handle.startsWith("@") ? handle : `@${handle}`;
    const res = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: { part: "snippet", q, type: "channel", maxResults: 10, key: apiKey },
    });

    const items: YouTubeSearchItem[] = res.data.items || [];
    if (items.length === 0) return null;

    const normHandle = handle.toLowerCase().replace(/^@/, "");

    // 1. Exact customUrl match
    for (const item of items) {
      const custom = item.snippet?.customUrl?.toLowerCase().replace(/^@/, "").replace(/^youtube\.com\//, "").replace(/^\//, "");
      if (custom === normHandle) return item.id.channelId;
    }

    // 2. Title match
    for (const item of items) {
      const title = (item.snippet?.title || "").toLowerCase();
      if (normHandle.includes(title) || title.includes(normHandle)) return item.id.channelId;
    }

    // 3. First result fallback
    return items[0].id.channelId;
  } catch {
    return null;
  }
}

/**
 * Resolve handle to channel ID via forUsername fallback.
 */
async function resolveViaUsername(handle: string, apiKey: string): Promise<string | null> {
  try {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
      params: { part: "id", forUsername: handle, key: apiKey },
    });
    return res.data.items?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Resolve YouTube channel identifier to channel ID.
 */
export async function resolveChannelId(
  identifier: string,
  apiKey: string,
): Promise<{ channelId: string | null; error: string | null }> {
  if (!apiKey?.trim()) return { channelId: null, error: "YouTube API key is not configured" };

  const iden = identifier.trim();
  if (!iden) return { channelId: null, error: "Channel identifier is required" };

  // 1. Existing ID
  if (iden.startsWith("UC") && iden.length >= 24) {
    const validId = await validateExistingChannelId(iden, apiKey);
    return validId ? { channelId: validId, error: null } : { channelId: null, error: `Channel ID not found: ${iden}` };
  }

  // 2. URL extraction
  let handle: string | null = null;
  if (iden.includes("youtube.com") || iden.includes("youtu.be")) {
    const extracted = extractFromUrl(iden);
    if (extracted?.channelId) return resolveChannelId(extracted.channelId, apiKey);
    handle = extracted?.handle || null;
  } else {
    handle = iden.replace(/^@/, "");
  }

  // 3. Resolve handle
  if (handle) {
    const idFromSearch = await resolveViaSearch(handle, apiKey);
    if (idFromSearch) return { channelId: idFromSearch, error: null };

    const idFromUser = await resolveViaUsername(handle, apiKey);
    if (idFromUser) return { channelId: idFromUser, error: null };

    return { channelId: null, error: `Channel handle not found: @${handle}` };
  }

  return { channelId: null, error: "Could not parse channel identifier" };
}

/**
 * Validate YouTube channel identifier.
 */
export async function validateYouTubeIdentifier(
  identifier: string,
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const { error } = await resolveChannelId(identifier, apiKey);
  return error ? { valid: false, error } : { valid: true };
}