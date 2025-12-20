/**
 * Reddit image extraction utilities.
 */

import { logger } from "@server/utils/logger";
import { extractYouTubeVideoId } from "../base/utils";
import { extractThumbnailUrlFromPage } from "../base/utils/thumbnails";
import {
  fixRedditMediaUrl,
  extractUrlsFromText,
  decodeHtmlEntitiesInUrl,
  convertRedditPreviewUrl,
} from "./urls";
import type { RedditPostData } from "./types";

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
      // Check if there's a YouTube video that would take priority (Priority 0, checked first)
      const videoId = extractYouTubeVideoId(decodedUrl);
      if (videoId) {
        return false; // YouTube video takes priority
      }

      // Check selftext for YouTube videos (Priority 0, checked before v.redd.it)
      if (post.is_self && post.selftext) {
        const urls = extractUrlsFromText(post.selftext);
        for (const url of urls) {
          const videoId = extractYouTubeVideoId(url);
          if (videoId) {
            return false; // YouTube video in selftext takes priority
          }
        }
      }

      // Check for gallery (Priority 1 - takes priority over v.redd.it)
      if (
        post.is_gallery &&
        post.media_metadata &&
        post.gallery_data?.items?.[0]
      ) {
        return false; // Gallery takes priority
      }

      // Check for direct image (Priority 2 - takes priority over v.redd.it)
      const url = decodedUrl.toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp"].some((ext) => url.endsWith(ext))) {
        return false; // Direct image takes priority
      }

      // No higher priority content found, v.redd.it will be used as header
      return true;
    }
  }

  // Check selftext for v.redd.it URLs (only if post.url is not v.redd.it)
  if (post.is_self && post.selftext) {
    const urls = extractUrlsFromText(post.selftext);
    let hasVReddit = false;
    for (const url of urls) {
      if (url.includes("v.redd.it")) {
        hasVReddit = true;
        break;
      }
    }

    if (hasVReddit) {
      // Check if there's a YouTube video that would take priority
      for (const url of urls) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          return false; // YouTube video takes priority
        }
      }

      // Check for gallery (Priority 1)
      if (
        post.is_gallery &&
        post.media_metadata &&
        post.gallery_data?.items?.[0]
      ) {
        return false; // Gallery takes priority
      }

      // Check post.url for direct image (Priority 2)
      if (post.url) {
        const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
        const url = decodedUrl.toLowerCase();
        if (
          [".jpg", ".jpeg", ".png", ".webp"].some((ext) => url.endsWith(ext))
        ) {
          return false; // Direct image takes priority
        }
      }

      // No higher priority content found, v.redd.it in selftext will be used as header
      return true;
    }
  }

  return false;
}

/**
 * Extract thumbnail URL from Reddit post.
 */
export function extractThumbnailUrl(post: RedditPostData): string | null {
  try {
    // Check if submission has a valid thumbnail URL
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

    // Try to get from preview data
    if (post.preview?.images?.[0]?.source?.url) {
      const decoded = decodeURIComponent(post.preview.images[0].source.url);
      const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
      return fixRedditMediaUrl(decodedEntities);
    }

    // For image posts, use the URL directly if it's an image
    if (post.url) {
      const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
      const url = decodedUrl.toLowerCase();
      if (
        [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
          url.endsWith(ext),
        )
      ) {
        return decodedUrl;
      }
    }

    // For video posts, try to get preview
    if (post.url) {
      const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
      if (decodedUrl.includes("v.redd.it")) {
        const previewUrl = extractRedditVideoPreview(post);
        if (previewUrl) {
          return previewUrl;
        }
      }
    }

    return null;
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
 * Extract high-quality header image URL from a Reddit post.
 * Prioritizes YouTube videos for embedding, then high-quality images suitable for use as header images.
 */
export async function extractHeaderImageUrl(
  post: RedditPostData & { selftext?: string },
): Promise<string | null> {
  try {
    // Priority 0: Check for YouTube videos and v.redd.it videos (highest priority - embed instead of image)
    // Check post URL first
    if (post.url) {
      const decodedUrl = decodeHtmlEntitiesInUrl(post.url);

      // Check for v.redd.it videos
      if (decodedUrl.includes("v.redd.it")) {
        // Construct embed URL from permalink
        const decodedPermalink = decodeHtmlEntitiesInUrl(post.permalink);
        const embedUrl = `https://reddit.com${decodedPermalink}/embed`;
        logger.debug(
          { url: decodedUrl, embedUrl },
          "Found v.redd.it video in post URL",
        );
        return embedUrl; // Return embed URL for iframe embedding
      }

      // Check for YouTube videos
      const videoId = extractYouTubeVideoId(decodedUrl);
      if (videoId) {
        logger.debug(
          { url: decodedUrl, videoId },
          "Found YouTube video in post URL",
        );
        return decodedUrl; // Return YouTube URL for embedding
      }
    }

    // Check URLs in selftext for v.redd.it and YouTube videos
    if (post.is_self && post.selftext) {
      logger.debug(
        { selftext: post.selftext },
        "Extracting URLs from selftext",
      );
      const urls = extractUrlsFromText(post.selftext);
      logger.debug({ urls }, "Extracted URLs from selftext");
      for (const url of urls) {
        logger.debug({ url }, "Checking if URL is a video");

        // Check for v.redd.it videos
        if (url.includes("v.redd.it")) {
          // Construct embed URL from permalink
          const decodedPermalink = decodeHtmlEntitiesInUrl(post.permalink);
          const embedUrl = `https://reddit.com${decodedPermalink}/embed`;
          logger.debug({ url, embedUrl }, "Found v.redd.it video in selftext");
          return embedUrl; // Return embed URL for iframe embedding
        }

        // Check for YouTube videos
        const videoId = extractYouTubeVideoId(url);
        logger.debug({ videoId }, "Extracted YouTube video ID from URL");
        if (videoId) {
          logger.debug({ url, videoId }, "Found YouTube video in selftext");
          return url; // Return YouTube URL for embedding
        } else {
          logger.debug({ url }, "Not a video");
        }
      }
    }
    // Priority 1: Gallery posts - get first high-quality image
    if (
      post.is_gallery &&
      post.media_metadata &&
      post.gallery_data?.items?.[0]
    ) {
      const mediaId = post.gallery_data.items[0].media_id;
      const mediaInfo = post.media_metadata[mediaId];

      if (mediaInfo) {
        // For animated images, prefer GIF or MP4
        if (mediaInfo.e === "AnimatedImage") {
          if (mediaInfo.s?.gif) {
            const decoded = decodeURIComponent(mediaInfo.s.gif);
            const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
            const gifUrl = fixRedditMediaUrl(decodedEntities);
            logger.debug(
              { url: gifUrl },
              "Extracted header image from gallery GIF",
            );
            return gifUrl;
          } else if (mediaInfo.s?.mp4) {
            const decoded = decodeURIComponent(mediaInfo.s.mp4);
            const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
            const mp4Url = fixRedditMediaUrl(decodedEntities);
            logger.debug(
              { url: mp4Url },
              "Extracted header image from gallery MP4",
            );
            return mp4Url;
          }
        }
        // For regular images, get the high-quality URL
        else if (mediaInfo.e === "Image" && mediaInfo.s?.u) {
          const decoded = decodeURIComponent(mediaInfo.s.u);
          const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
          const imageUrl = fixRedditMediaUrl(decodedEntities);
          logger.debug(
            { url: imageUrl },
            "Extracted header image from gallery",
          );
          return imageUrl;
        }
      }
    }

    // Priority 2: Direct image posts - extract imageUrl from URL
    if (post.url) {
      const decodedUrl = decodeHtmlEntitiesInUrl(post.url);

      // Ignore Reddit post URLs - they have pattern: /comments/{postId}/{title}/
      // (not comment URLs which have /comments/{postId}/{title}/{commentId})
      const redditPostUrlPattern =
        /https?:\/\/[^\s]*reddit\.com\/r\/[^\/\s]+\/comments\/[a-zA-Z0-9]+\/[^\/\s]+\/?$/;
      if (redditPostUrlPattern.test(decodedUrl)) {
        logger.debug({ url: decodedUrl }, "Skipping Reddit post URL");
        // Continue to next priority instead of returning
      } else {
        return decodedUrl;
      }
    }

    // Priority 4: Fall back to thumbnail extraction
    const thumbnailUrl = extractThumbnailUrl(post);
    if (thumbnailUrl) {
      logger.debug(
        { url: thumbnailUrl },
        "Falling back to thumbnail as header",
      );
      return thumbnailUrl;
    }

    // Priority 5: Extract URLs from text post selftext and try to find images
    // Only if no better image was found above
    if (post.is_self && post.selftext) {
      // Truncate selftext before comment URLs to avoid extracting images from comments
      // Reddit comment URLs have pattern: /comments/{postId}/{title}/{commentId}
      let selftextToProcess = post.selftext;
      const commentUrlPattern =
        /https?:\/\/[^\s]*\/comments\/[a-zA-Z0-9]+\/[^\/\s]+\/[a-zA-Z0-9]+/;
      const commentUrlMatch = selftextToProcess.match(commentUrlPattern);
      if (commentUrlMatch && commentUrlMatch.index !== undefined) {
        // Truncate at the start of the comment URL
        selftextToProcess = selftextToProcess.substring(
          0,
          commentUrlMatch.index,
        );
      }
      const urls = extractUrlsFromText(selftextToProcess);
      if (urls.length > 0) {
        logger.debug(
          { count: urls.length },
          "Found URL(s) in selftext, checking for images",
        );
        // Try each URL - prioritize direct image URLs, then other URLs
        // The actual image extraction will be done by standardizeContentFormat()
        // URLs from extractUrlsFromText are already decoded
        let firstValidUrl: string | null = null;
        for (const url of urls) {
          // Skip invalid URLs
          if (!url.startsWith("http://") && !url.startsWith("https://")) {
            continue;
          }
          // Track first valid URL for fallback
          if (firstValidUrl === null) {
            firstValidUrl = url;
          }
          // If it's a direct image URL, return it immediately
          if (
            [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
              url.toLowerCase().endsWith(ext),
            )
          ) {
            logger.debug({ url }, "Found direct image URL in selftext");
            return url;
          }
        }
        // If no direct image URLs found, return first valid URL
        // standardizeContentFormat() will try to extract an image from it
        if (firstValidUrl) {
          logger.debug(
            { url: firstValidUrl },
            "Found URL in selftext, will extract image",
          );
          return firstValidUrl;
        }
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error }, "Could not extract header image URL");
    return null;
  }
}
