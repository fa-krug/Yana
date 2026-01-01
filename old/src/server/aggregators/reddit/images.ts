/**
 * Reddit image extraction utilities.
 */

import { logger } from "@server/utils/logger";

import { extractYouTubeVideoId } from "../base/utils";

import type { RedditPostData } from "./types";
import {
  fixRedditMediaUrl,
  extractUrlsFromText,
  decodeHtmlEntitiesInUrl,
} from "./urls";

/**
 * Check if a post has higher priority content (videos, galleries)
 * that would take precedence over a direct image or GIF.
 */
function hasHigherPriorityContent(
  post: RedditPostData & { selftext?: string },
): boolean {
  // Check for gallery (Priority 1)
  if (post.is_gallery && post.media_metadata && post.gallery_data?.items?.[0]) {
    return true;
  }

  // Check for YouTube videos (Priority 0)
  if (post.url) {
    const postUrl = decodeHtmlEntitiesInUrl(post.url);
    if (extractYouTubeVideoId(postUrl)) {
      return true;
    }
    // Check for v.redd.it videos (Priority 0)
    if (postUrl.includes("v.redd.it")) {
      return true;
    }
  }

  // Check selftext for YouTube/v.redd.it videos (Priority 0)
  if (post.is_self && post.selftext) {
    const urls = extractUrlsFromText(post.selftext);
    for (const textUrl of urls) {
      if (extractYouTubeVideoId(textUrl) || textUrl.includes("v.redd.it")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a direct image URL would be used as a header element.
 * Returns true if the URL would be used as a header image (Priority 2).
 *
 * Based on extractHeaderImageUrl priority:
 * - Priority 0: YouTube videos and v.redd.it videos
 * - Priority 1: Gallery posts
 * - Priority 2: Direct image posts
 *
 * A direct image URL will be used as header if:
 * - It's a direct image URL (.jpg, .jpeg, .png, .webp, or i.redd.it)
 * - No gallery exists (Priority 1)
 * - No YouTube/v.redd.it videos exist (Priority 0)
 */
export function wouldUseDirectImageAsHeader(
  post: RedditPostData & { selftext?: string },
  url: string,
): boolean {
  const decodedUrl = decodeHtmlEntitiesInUrl(url);
  const urlLower = decodedUrl.toLowerCase();

  // Check if it's a direct image URL
  const isDirectImage =
    [".jpg", ".jpeg", ".png", ".webp"].some((ext) => urlLower.endsWith(ext)) ||
    urlLower.includes("i.redd.it");

  if (!isDirectImage) {
    return false;
  }

  return !hasHigherPriorityContent(post);
}

/**
 * Check if a GIF URL would be used as a header element.
 * Returns true if the URL would be used as a header image (Priority 2).
 *
 * Based on extractHeaderImageUrl priority:
 * - Priority 0: YouTube videos and v.redd.it videos
 * - Priority 1: Gallery posts
 * - Priority 2: Direct image posts (including GIFs)
 *
 * A GIF URL will be used as header if:
 * - It's a GIF URL (.gif, .gifv, or preview.redd.it with .gif)
 * - No gallery exists (Priority 1)
 * - No YouTube/v.redd.it videos exist (Priority 0)
 * - It's not a Reddit post URL
 */
export function wouldUseGifAsHeader(
  post: RedditPostData & { selftext?: string },
  url: string,
): boolean {
  const decodedUrl = decodeHtmlEntitiesInUrl(url);
  const urlLower = decodedUrl.toLowerCase();

  // Check if it's a GIF URL
  const isGif =
    urlLower.endsWith(".gif") ||
    urlLower.endsWith(".gifv") ||
    (urlLower.includes("preview.redd.it") && urlLower.includes(".gif"));

  if (!isGif) {
    return false;
  }

  if (hasHigherPriorityContent(post)) {
    return false;
  }

  // Check if it's a Reddit post URL (should not be used as header)
  const redditPostUrlPattern =
    /https?:\/\/[^\s]*reddit\.com\/r\/[^/\s]+\/comments\/[a-zA-Z0-9]+\/[^/\s]+\/?$/;
  if (redditPostUrlPattern.test(decodedUrl)) {
    return false; // Reddit post URLs are not used as headers
  }

  // No higher priority content found, GIF will be used as header
  return true;
}

/**
 * Check if a YouTube URL would be used as a header element.
 * YouTube videos are always used as header (Priority 0).
 */
export function wouldUseYouTubeAsHeader(url: string): boolean {
  const decodedUrl = decodeHtmlEntitiesInUrl(url);
  const videoId = extractYouTubeVideoId(decodedUrl);
  return !!videoId;
}

/**
 * Check if a post URL has higher priority content than a v.redd.it video.
 */
function hasHigherPriorityThanVReddit(
  post: RedditPostData & { selftext?: string },
  decodedUrl: string,
): boolean {
  // Check if there's a YouTube video that would take priority (Priority 0, checked first)
  if (extractYouTubeVideoId(decodedUrl)) {
    return true;
  }

  // Check selftext for YouTube videos (Priority 0, checked before v.redd.it)
  if (post.is_self && post.selftext) {
    const urls = extractUrlsFromText(post.selftext);
    for (const url of urls) {
      if (extractYouTubeVideoId(url)) {
        return true;
      }
    }
  }

  // Check for gallery (Priority 1 - takes priority over v.redd.it)
  if (post.is_gallery && post.media_metadata && post.gallery_data?.items?.[0]) {
    return true;
  }

  // Check for direct image (Priority 2 - takes priority over v.redd.it)
  const url = decodedUrl.toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].some((ext) => url.endsWith(ext))) {
    return true;
  }

  return false;
}

/**
 * Check if a v.redd.it in selftext would be prioritized as a header.
 */
function hasHigherPriorityThanVRedditInSelftext(
  post: RedditPostData & { selftext?: string },
  urls: string[],
): boolean {
  // Check if there's a YouTube video that would take priority
  for (const url of urls) {
    if (extractYouTubeVideoId(url)) {
      return true;
    }
  }

  // Check for gallery (Priority 1)
  if (post.is_gallery && post.media_metadata && post.gallery_data?.items?.[0]) {
    return true;
  }

  // Check post.url for direct image (Priority 2)
  if (post.url) {
    const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
    const url = decodedUrl.toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp"].some((ext) => url.endsWith(ext))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a v.redd.it URL would be used as a header element.
 * Returns true if the v.redd.it video would be prioritized as a header.
 *
 * Based on extractHeaderImageUrl priority:
 * - Priority 0: YouTube videos (post.url, then selftext) - checked first
 * - Priority 0: v.redd.it videos (post.url, then selftext) - checked after YouTube
 * - Priority 1: Gallery posts
 * - Priority 2: Direct image posts
 *
 * So v.redd.it will be used as header if:
 * - It's in post.url AND no YouTube video AND no gallery AND no direct image
 * - OR it's in selftext AND no YouTube video AND no v.redd.it in post.url AND no gallery AND no direct image
 */
export function wouldUseVRedditAsHeader(
  post: RedditPostData & { selftext?: string },
): boolean {
  // Check if post URL is v.redd.it
  if (post.url) {
    const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
    if (decodedUrl.includes("v.redd.it")) {
      return !hasHigherPriorityThanVReddit(post, decodedUrl);
    }
  }

  // Check selftext for v.redd.it URLs (only if post.url is not v.redd.it)
  if (post.is_self && post.selftext) {
    const urls = extractUrlsFromText(post.selftext);
    const hasVReddit = urls.some((url) => url.includes("v.redd.it"));

    if (hasVReddit) {
      return !hasHigherPriorityThanVRedditInSelftext(post, urls);
    }
  }

  return false;
}

/**
 * Get thumbnail from post thumbnail property.
 */
function getThumbnailFromPost(post: RedditPostData): string | null {
  if (
    post.thumbnail &&
    !["self", "default", "nsfw", "spoiler"].includes(post.thumbnail)
  ) {
    if (post.thumbnail.startsWith("http")) {
      return decodeHtmlEntitiesInUrl(post.thumbnail);
    }
    if (post.thumbnail.startsWith("/")) {
      return decodeHtmlEntitiesInUrl(`https://reddit.com${post.thumbnail}`);
    }
  }
  return null;
}

/**
 * Get thumbnail from post preview images.
 */
function getThumbnailFromPreview(post: RedditPostData): string | null {
  if (post.preview?.images?.[0]?.source?.url) {
    const decoded = decodeURIComponent(post.preview.images[0].source.url);
    const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
    return fixRedditMediaUrl(decodedEntities);
  }
  return null;
}

/**
 * Get thumbnail from post URL if it's an image or video.
 */
function getThumbnailFromMediaUrl(post: RedditPostData): string | null {
  if (!post.url) return null;

  const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
  const urlLower = decodedUrl.toLowerCase();

  // For image posts
  if (
    [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
      urlLower.endsWith(ext),
    )
  ) {
    return decodedUrl;
  }

  // For video posts
  if (urlLower.includes("v.redd.it")) {
    return extractRedditVideoPreview(post);
  }

  return null;
}

/**
 * Extract thumbnail URL from Reddit post.
 */
export function extractThumbnailUrl(post: RedditPostData): string | null {
  try {
    const thumbnail = getThumbnailFromPost(post);
    if (thumbnail) return thumbnail;

    const preview = getThumbnailFromPreview(post);
    if (preview) return preview;

    return getThumbnailFromMediaUrl(post);
  } catch (error) {
    logger.debug({ error }, "Could not extract thumbnail URL");
    return null;
  }
}

/**
 * Extract preview/thumbnail image URL from a Reddit video post.
 */
export function extractRedditVideoPreview(post: RedditPostData): string | null {
  try {
    if (!post.preview?.images?.[0]?.source?.url) {
      return null;
    }

    const decoded = decodeURIComponent(post.preview.images[0].source.url);
    const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
    const previewUrl = fixRedditMediaUrl(decodedEntities);
    logger.debug({ url: previewUrl }, "Extracted Reddit video preview");
    return previewUrl;
  } catch (error) {
    logger.debug({ error }, "Could not extract Reddit video preview");
    return null;
  }
}

/**
 * Extract animated GIF URL from Reddit preview data.
 */
export function extractAnimatedGifUrl(post: RedditPostData): string | null {
  try {
    if (!post.preview?.images?.[0]) {
      return null;
    }

    const imageData = post.preview.images[0];

    if (imageData.variants?.gif?.source?.url) {
      const decoded = decodeURIComponent(imageData.variants.gif.source.url);
      const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
      const gifUrl = fixRedditMediaUrl(decodedEntities);
      logger.debug({ url: gifUrl }, "Extracted animated GIF URL");
      return gifUrl;
    }

    if (imageData.variants?.mp4?.source?.url) {
      const decoded = decodeURIComponent(imageData.variants.mp4.source.url);
      const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
      const mp4Url = fixRedditMediaUrl(decodedEntities);
      logger.debug({ url: mp4Url }, "Extracted animated MP4 URL");
      return mp4Url;
    }

    return null;
  } catch (error) {
    logger.debug({ error }, "Could not extract animated GIF URL");
    return null;
  }
}

/**
 * Extract video embed URL (YouTube or v.redd.it) from post URL or selftext.
 */
function extractVideoEmbedUrl(
  post: RedditPostData & { selftext?: string },
): string | null {
  // Check post URL first
  if (post.url) {
    const decodedUrl = decodeHtmlEntitiesInUrl(post.url);

    // Check for v.redd.it videos
    if (decodedUrl.includes("v.redd.it")) {
      const decodedPermalink = decodeHtmlEntitiesInUrl(post.permalink);
      const normalizedPermalink = decodedPermalink.replace(/\/$/, "");
      return `https://vxreddit.com${normalizedPermalink}`;
    }

    // Check for YouTube videos
    if (extractYouTubeVideoId(decodedUrl)) {
      return decodedUrl;
    }
  }

  // Check URLs in selftext
  if (post.is_self && post.selftext) {
    const urls = extractUrlsFromText(post.selftext);
    for (const url of urls) {
      if (url.includes("v.redd.it")) {
        const decodedPermalink = decodeHtmlEntitiesInUrl(post.permalink);
        const normalizedPermalink = decodedPermalink.replace(/\/$/, "");
        return `https://vxreddit.com${normalizedPermalink}`;
      }

      if (extractYouTubeVideoId(url)) {
        return url;
      }
    }
  }

  return null;
}

/**
 * Extract high-quality image URL from a Reddit gallery post.
 */
function extractGalleryImageUrl(post: RedditPostData): string | null {
  if (post.is_gallery && post.media_metadata && post.gallery_data?.items?.[0]) {
    const mediaId = post.gallery_data.items[0].media_id;
    const mediaInfo = post.media_metadata[mediaId];

    if (mediaInfo) {
      // For animated images, prefer GIF or MP4
      if (mediaInfo.e === "AnimatedImage") {
        const animatedUrl = mediaInfo.s?.gif || mediaInfo.s?.mp4;
        if (animatedUrl) {
          const decoded = decodeURIComponent(animatedUrl);
          return fixRedditMediaUrl(decodeHtmlEntitiesInUrl(decoded));
        }
      }
      // For regular images, get the high-quality URL
      else if (mediaInfo.e === "Image" && mediaInfo.s?.u) {
        const decoded = decodeURIComponent(mediaInfo.s.u);
        return fixRedditMediaUrl(decodeHtmlEntitiesInUrl(decoded));
      }
    }
  }
  return null;
}

/**
 * Extract image URL from selftext URLs.
 */
function extractImageUrlFromSelftext(
  post: RedditPostData & { selftext?: string },
): string | null {
  if (!post.is_self || !post.selftext) {
    return null;
  }

  // Truncate selftext before comment URLs
  let selftextToProcess = post.selftext;
  const commentUrlPattern =
    /https?:\/\/[^\s]*\/comments\/[a-zA-Z0-9]+\/[^/\s]+\/[a-zA-Z0-9]+/;
  const commentUrlMatch = commentUrlPattern.exec(selftextToProcess);
  if (commentUrlMatch) {
    selftextToProcess = selftextToProcess.substring(0, commentUrlMatch.index);
  }

  const urls = extractUrlsFromText(selftextToProcess);
  if (urls.length === 0) {
    return null;
  }

  let firstValidUrl: string | null = null;
  for (const url of urls) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      continue;
    }
    if (firstValidUrl === null) {
      firstValidUrl = url;
    }
    if (
      [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
        url.toLowerCase().endsWith(ext),
      )
    ) {
      return url;
    }
  }

  return firstValidUrl;
}

/**
 * Extract high-quality header image URL from a Reddit post.
 * Prioritizes YouTube videos for embedding, then high-quality images suitable for use as header images.
 */
export async function extractHeaderImageUrl(
  post: RedditPostData & { selftext?: string },
): Promise<string | null> {
  try {
    // Priority 0: Check for YouTube videos and v.redd.it videos (highest priority - embed instead of image)
    const videoUrl = extractVideoEmbedUrl(post);
    if (videoUrl) {
      return videoUrl;
    }

    // Priority 1: Gallery posts - get first high-quality image
    const galleryUrl = extractGalleryImageUrl(post);
    if (galleryUrl) {
      return galleryUrl;
    }

    // Priority 2: Direct image posts (including GIFs) - extract imageUrl from URL
    if (post.url) {
      const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
      const urlLower = decodedUrl.toLowerCase();

      // Ignore Reddit post URLs
      const redditPostUrlPattern =
        /https?:\/\/[^\s]*reddit\.com\/r\/[^/\s]+\/comments\/[a-zA-Z0-9]+\/[^/\s]+\/?$/;

      if (!redditPostUrlPattern.test(decodedUrl)) {
        const isDirectImage =
          [".jpg", ".jpeg", ".png", ".webp", ".gif", ".gifv"].some((ext) =>
            urlLower.endsWith(ext),
          ) ||
          urlLower.includes("i.redd.it") ||
          (urlLower.includes("preview.redd.it") && urlLower.includes(".gif"));

        if (isDirectImage) {
          return decodedUrl;
        }
      }
    }

    // Priority 4: Fall back to thumbnail extraction
    const thumbnailUrl = extractThumbnailUrl(post);
    if (thumbnailUrl) {
      return thumbnailUrl;
    }

    // Priority 5: Extract URLs from text post selftext and try to find images
    return extractImageUrlFromSelftext(post);
  } catch (error) {
    logger.debug({ error }, "Could not extract header image URL");
    return null;
  }
}
