/**
 * Reddit media handling strategies.
 *
 * Handles different media types (GIF, images, videos) in Reddit posts
 * using a strategy pattern.
 */

import {
  extractAnimatedGifUrl,
  extractRedditVideoPreview,
  wouldUseVRedditAsHeader,
  wouldUseDirectImageAsHeader,
  wouldUseYouTubeAsHeader,
  wouldUseGifAsHeader,
} from "./images";
import { escapeHtml } from "./markdown";
import type { RedditPostData } from "./types";
import { fixRedditMediaUrl } from "./urls";

/**
 * Strategy for handling GIF media in links.
 */
export function handleGifMediaStrategy(
  post: RedditPostData,
  url: string,
  urlLower: string,
  contentParts: string[],
): boolean {
  if (urlLower.endsWith(".gif") || urlLower.endsWith(".gifv")) {
    if (!wouldUseGifAsHeader(post, url)) {
      const gifUrl = extractAnimatedGifUrl(post) || (urlLower.endsWith(".gifv") ? url.slice(0, -1) : url);
      const fixedUrl = fixRedditMediaUrl(gifUrl);
      if (fixedUrl) contentParts.push(`<p><img src="${fixedUrl}" alt="Animated GIF"></p>`);
    }
    return true;
  }
  return false;
}

/**
 * Strategy for handling direct image media in links.
 */
export function handleImageMediaStrategy(
  post: RedditPostData,
  url: string,
  urlLower: string,
  contentParts: string[],
): boolean {
  const isImage =
    [".jpg", ".jpeg", ".png", ".webp"].some((ext) => urlLower.endsWith(ext)) ||
    urlLower.includes("i.redd.it");

  if (isImage) {
    if (!wouldUseDirectImageAsHeader(post, url)) {
      const fixedUrl = fixRedditMediaUrl(url);
      if (fixedUrl) contentParts.push(`<p><a href="${fixedUrl}">${escapeHtml(fixedUrl)}</a></p>`);
    }
    return true;
  }
  return false;
}

/**
 * Strategy for handling video media (Reddit videos and YouTube).
 */
export function handleVideoMediaStrategy(
  post: RedditPostData,
  url: string,
  urlLower: string,
  contentParts: string[],
): boolean {
  if (urlLower.includes("v.redd.it")) {
    if (!wouldUseVRedditAsHeader(post)) {
      const previewUrl = extractRedditVideoPreview(post);
      if (previewUrl) contentParts.push(`<p><img src="${previewUrl}" alt="Video thumbnail"></p>`);
      contentParts.push(`<p><a href="${url}">▶ View Video</a></p>`);
    }
    return true;
  }

  if (urlLower.includes("youtube.com") || urlLower.includes("youtu.be")) {
    if (!wouldUseYouTubeAsHeader(url)) {
      contentParts.push(`<p><a href="${url}">▶ View Video on YouTube</a></p>`);
    }
    return true;
  }

  return false;
}

/**
 * Media type handlers in order of precedence.
 */
const mediaHandlers = [
  handleGifMediaStrategy,
  handleImageMediaStrategy,
  handleVideoMediaStrategy,
];

/**
 * Process link media by delegating to appropriate handler.
 */
export function processLinkMedia(
  post: RedditPostData,
  url: string,
  contentParts: string[],
): boolean {
  const urlLower = url.toLowerCase();

  for (const handler of mediaHandlers) {
    if (handler(post, url, urlLower, contentParts)) {
      return true;
    }
  }

  return false;
}
