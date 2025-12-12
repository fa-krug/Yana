/**
 * YouTube channel resolution utilities.
 */

import axios from "axios";
import { logger } from "@server/utils/logger";
import { getYouTubeErrorMessage } from "./errors";

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
 * Resolve YouTube channel identifier to channel ID.
 *
 * This function handles various YouTube channel identifier formats and uses
 * the YouTube Data API v3 to resolve them to a canonical channel ID (UC...).
 *
 * **Supported formats:**
 * - Channel handle: `@mkbhd`, `mkbhd` (with or without @)
 * - Channel ID: `UCBJycsmduvYEL83R_U4JriQ` (starts with UC, 24+ chars)
 * - Full URL: `https://www.youtube.com/@mkbhd` or `https://www.youtube.com/channel/UC...`
 *
 * **Resolution process:**
 * 1. If identifier is already a channel ID (starts with UC), validates it via API
 * 2. If identifier is a URL, extracts handle or channel ID from path
 * 3. If identifier is a handle, uses `search.list` API call
 * 4. Falls back to `channels.list(forUsername=...)` if direct handle lookup fails
 */
export async function resolveChannelId(
  identifier: string,
  apiKey: string,
): Promise<{ channelId: string | null; error: string | null }> {
  if (!apiKey || apiKey.trim() === "") {
    return {
      channelId: null,
      error: "YouTube API key is not configured in user settings",
    };
  }

  identifier = identifier.trim();

  if (!identifier) {
    return { channelId: null, error: "Channel identifier is required" };
  }

  // If it starts with UC and is 24+ chars, assume it's already a channel ID
  if (identifier.startsWith("UC") && identifier.length >= 24) {
    // Validate it exists via API
    try {
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/channels",
        {
          params: {
            part: "id",
            id: identifier,
            key: apiKey,
          },
        },
      );

      if (response.data.items && response.data.items.length > 0) {
        return { channelId: identifier, error: null };
      }
      return { channelId: null, error: `Channel ID not found: ${identifier}` };
    } catch (error) {
      logger.error(
        { error, identifier },
        "YouTube API error resolving channel ID",
      );
      const errorMessage = getYouTubeErrorMessage(error);
      return {
        channelId: null,
        error: errorMessage,
      };
    }
  }

  // Extract handle from URL if it's a URL
  let handle: string | null = null;
  if (
    identifier.startsWith("http://") ||
    identifier.startsWith("https://") ||
    identifier.startsWith("youtube.com") ||
    identifier.startsWith("www.youtube.com")
  ) {
    try {
      if (!identifier.startsWith("http")) {
        identifier = `https://${identifier}`;
      }

      const url = new URL(identifier);
      const path = url.pathname.trim().replace(/^\//, "");

      // Remove query parameters and fragments from path
      const cleanPath = path.split("?")[0].split("#")[0];

      // Handle @username format (modern handles)
      if (cleanPath.startsWith("@")) {
        handle = cleanPath.slice(1).split("/")[0]; // Remove @ and get first part
      }
      // Handle /c/customname format
      else if (cleanPath.startsWith("c/") || cleanPath.startsWith("user/")) {
        handle = cleanPath.split("/")[1].split("?")[0].split("#")[0];
      }
      // Handle /channel/UC... format
      else if (cleanPath.startsWith("channel/")) {
        const channelId = cleanPath.split("/")[1].split("?")[0].split("#")[0];
        if (channelId && channelId.startsWith("UC")) {
          return resolveChannelId(channelId, apiKey);
        }
      }
      // Check query parameters for channel_id
      else if (url.searchParams.has("channel_id")) {
        const channelId = url.searchParams.get("channel_id");
        if (channelId && channelId.startsWith("UC")) {
          return resolveChannelId(channelId, apiKey);
        }
      }
    } catch (error) {
      logger.error({ error, identifier }, "Error parsing URL");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        channelId: null,
        error: `Invalid URL format: ${errorMessage}`,
      };
    }
  } else if (identifier.startsWith("@")) {
    handle = identifier.slice(1); // Remove @
  } else {
    // Assume it's a handle without @
    handle = identifier;
  }

  // Resolve handle to channel ID using API
  if (handle) {
    try {
      // For modern @handles, forUsername doesn't work. Use search.list instead.
      // Try searching with the handle (with @ prefix for better matching)
      // handle is guaranteed to be non-null here due to the if check above
      const searchQuery = handle.startsWith("@") ? handle : `@${handle}`;

      // First, try searching for the exact handle
      const searchResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            part: "snippet",
            q: searchQuery,
            type: "channel",
            maxResults: 10, // Get more results to find the best match
            key: apiKey,
          },
        },
      );

      const searchItems: YouTubeSearchItem[] = searchResponse.data.items || [];
      if (searchItems.length > 0) {
        // Normalize handle for comparison (remove @, lowercase)
        // handle is guaranteed to be non-null here due to the outer if check
        const normalizedHandle = handle.toLowerCase().replace(/^@/, "");

        // Look for exact match by customUrl
        for (const item of searchItems) {
          const customUrl = item.snippet?.customUrl;
          if (customUrl) {
            // customUrl can be "@handle" or "handle" or "youtube.com/@handle"
            const customUrlNormalized = customUrl
              .toLowerCase()
              .replace(/^@/, "")
              .replace(/^youtube\.com\//, "")
              .replace(/^\//, "");
            if (customUrlNormalized === normalizedHandle) {
              const channelId = item.id.channelId;
              logger.info(
                { handle, channelId },
                "Resolved handle to channel ID via search (exact match by customUrl)",
              );
              return { channelId, error: null };
            }
          }
        }

        // Also check channel title for exact match (some channels don't have customUrl)
        for (const item of searchItems) {
          const title = (item.snippet?.title || "").toLowerCase();
          // Sometimes the handle is in the title
          if (
            normalizedHandle.includes(title) ||
            title.includes(normalizedHandle)
          ) {
            const channelId = item.id.channelId;
            logger.info(
              { handle, channelId },
              "Resolved handle to channel ID via search (exact match by title)",
            );
            return { channelId, error: null };
          }
        }

        // If no exact match, use the first result (most relevant)
        const channelId = searchItems[0].id.channelId;
        logger.info(
          { handle, channelId },
          "Resolved handle to channel ID via search (best match - first result)",
        );
        return { channelId, error: null };
      }

      // Fallback: Try forUsername for old-style usernames (deprecated but still works for some)
      // This is a last resort as it doesn't work for modern @handles
      try {
        const response = await axios.get(
          "https://www.googleapis.com/youtube/v3/channels",
          {
            params: {
              part: "id",
              forUsername: handle,
              key: apiKey,
            },
          },
        );
        const items = response.data.items || [];
        if (items.length > 0) {
          const channelId = items[0].id;
          logger.info(
            { handle, channelId },
            "Resolved handle to channel ID via forUsername",
          );
          return { channelId, error: null };
        }
      } catch (httpError) {
        // forUsername failed, which is expected for modern handles
        // Continue to return error below
      }

      return { channelId: null, error: `Channel handle not found: @${handle}` };
    } catch (error) {
      logger.error({ error, handle }, "Error resolving handle");
      const errorMessage = getYouTubeErrorMessage(error);
      return {
        channelId: null,
        error: errorMessage,
      };
    }
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
  const { channelId, error } = await resolveChannelId(identifier, apiKey);
  if (error) {
    return { valid: false, error };
  }
  return { valid: true };
}
