/**
 * YouTube utility functions.
 */

import { logger } from "@server/utils/logger";

/**
 * Extract YouTube video ID from URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    let videoId: string | null = null;

    // Handle youtu.be short URLs
    if (
      parsedUrl.hostname === "youtu.be" ||
      parsedUrl.hostname === "www.youtu.be"
    ) {
      videoId = parsedUrl.pathname.slice(1).split("?")[0].split("&")[0];
    }
    // Handle youtube.com URLs
    else if (
      parsedUrl.hostname === "youtube.com" ||
      parsedUrl.hostname === "www.youtube.com" ||
      parsedUrl.hostname === "m.youtube.com"
    ) {
      // /watch?v=VIDEO_ID
      if (parsedUrl.pathname === "/watch" || parsedUrl.pathname === "/watch/") {
        videoId = parsedUrl.searchParams.get("v");
      }
      // /embed/VIDEO_ID or /v/VIDEO_ID or /shorts/VIDEO_ID
      else if (
        parsedUrl.pathname.startsWith("/embed/") ||
        parsedUrl.pathname.startsWith("/v/") ||
        parsedUrl.pathname.startsWith("/shorts/")
      ) {
        const parts = parsedUrl.pathname.split("/");
        if (parts.length > 2) {
          videoId = parts[2].split("?")[0];
        }
      }
    }

    // Validate video ID format (typically 11 characters, alphanumeric with - and _)
    if (videoId && /^[\w-]+$/.test(videoId)) {
      return videoId;
    }

    return null;
  } catch (error) {
    logger.debug({ error, url }, "Failed to extract YouTube video ID");
    return null;
  }
}

/**
 * Get YouTube proxy URL for embedding.
 * Always uses BASE_URL from environment if set, otherwise defaults to frontend port (4200) in development
 * or backend port (3000) in production.
 */
export function getYouTubeProxyUrl(videoId: string): string {
  const baseUrl =
    process.env["BASE_URL"] ||
    (process.env["NODE_ENV"] === "development"
      ? "http://localhost:4200"
      : "http://localhost:3000");
  return `${baseUrl.replace(/\/$/, "")}/api/youtube-proxy?v=${encodeURIComponent(videoId)}`;
}

/**
 * Create YouTube embed HTML using proxy URL and embed container class.
 * Returns HTML string that can be used directly or loaded into cheerio.
 *
 * @param videoId - YouTube video ID
 * @param caption - Optional caption HTML to append after the iframe
 * @returns HTML string with youtube-embed-container div and iframe
 */
export function createYouTubeEmbedHtml(
  videoId: string,
  caption?: string,
): string {
  const embedUrl = getYouTubeProxyUrl(videoId);
  const iframeHtml =
    `<div class="youtube-embed-container">` +
    `<iframe src="${embedUrl}" ` +
    `title="YouTube video player" ` +
    `frameborder="0" ` +
    `style="width: 100%" ` +
    `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `allowfullscreen></iframe>` +
    (caption ? caption : "") +
    `</div>`;
  return iframeHtml;
}
