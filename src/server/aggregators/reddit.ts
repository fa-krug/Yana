/**
 * Reddit aggregator.
 *
 * Aggregates posts from Reddit subreddits using Reddit's OAuth2 API.
 * Based on the legacy Python implementation using PRAW.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { logger } from "../utils/logger";
import axios from "axios";
import { getUserSettings } from "../services/userSettings.service";
import { standardizeContentFormat } from "./base/process";
import { extractYouTubeVideoId } from "./base/utils";
import { marked } from "marked";

// Configure marked with extensions similar to Python version
// nl2br: Convert newlines to <br> (handled by breaks option)
// fenced_code: Support ```code blocks``` (enabled by default)
// tables: Support tables (enabled by default)
marked.setOptions({
  breaks: true, // Convert newlines to <br> (like nl2br extension)
  gfm: true, // GitHub Flavored Markdown (includes tables, strikethrough, etc.)
});

/**
 * Token cache entry.
 */
interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

/**
 * In-memory token cache per user.
 */
const tokenCache = new Map<number, TokenCacheEntry>();

/**
 * Get Reddit OAuth2 access token.
 * Implements client credentials flow with token caching.
 */
async function getRedditAccessToken(userId: number): Promise<string> {
  // Check cache first
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    // Token still valid (refresh 1 minute before expiration)
    return cached.token;
  }

  // Get credentials from user settings
  const settings = await getUserSettings(userId);

  // Validate Reddit is enabled
  if (!settings.redditEnabled) {
    throw new Error(
      "Reddit is not enabled. Please enable Reddit in your settings and configure API credentials.",
    );
  }

  // Validate credentials are present
  if (!settings.redditClientId || !settings.redditClientSecret) {
    throw new Error(
      "Reddit API credentials not configured. Please set Client ID and Client Secret in your settings.",
    );
  }

  const userAgent = settings.redditUserAgent || "Yana/1.0";

  try {
    // Request access token using OAuth2 client credentials flow
    const authUrl = "https://www.reddit.com/api/v1/access_token";
    const authData = new URLSearchParams({
      grant_type: "client_credentials",
    });

    const response = await axios.post(authUrl, authData, {
      auth: {
        username: settings.redditClientId,
        password: settings.redditClientSecret,
      },
      headers: {
        "User-Agent": userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    });

    if (
      response.status === 200 &&
      response.data?.access_token &&
      response.data?.token_type === "bearer"
    ) {
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600; // Default to 1 hour
      const expiresAt = Date.now() + expiresIn * 1000 - 60000; // Refresh 1 min early

      // Cache the token
      tokenCache.set(userId, { token, expiresAt });

      logger.debug(
        { userId, expiresIn },
        "Reddit OAuth token obtained and cached",
      );

      return token;
    }

    throw new Error("Invalid response from Reddit OAuth API");
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error(
          "Invalid Reddit API credentials. Please check your Client ID and Client Secret.",
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "Reddit app configuration issue. Check your app settings on Reddit.",
        );
      }
      if (error.response?.status === 429) {
        throw new Error("Rate limited by Reddit. Please try again later.");
      }
      throw new Error(
        `Reddit OAuth error: ${error.response?.statusText || error.message}`,
      );
    }
    throw new Error(
      `Failed to get Reddit access token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    selftext_html: string | null;
    url: string;
    permalink: string;
    created_utc: number;
    author: string;
    score: number;
    num_comments: number;
    thumbnail: string;
    preview?: {
      images?: Array<{
        source?: { url: string; width?: number; height?: number };
        variants?: {
          gif?: { source?: { url: string } };
          mp4?: { source?: { url: string } };
        };
      }>;
    };
    media_metadata?: Record<
      string,
      {
        e: string;
        s?: { u?: string; gif?: string; mp4?: string };
      }
    >;
    gallery_data?: {
      items?: Array<{ media_id: string; caption?: string }>;
    };
    is_gallery?: boolean;
    is_self: boolean;
    is_video?: boolean;
    media?: {
      reddit_video?: {
        fallback_url?: string;
      };
    };
  };
}

interface RedditComment {
  data: {
    id: string;
    body: string;
    body_html: string | null;
    author: string;
    score: number;
    permalink: string;
    created_utc: number;
    replies?: {
      data?: {
        children?: RedditComment[];
      };
    };
  };
}

interface RedditCommentsResponse {
  data: {
    children: RedditComment[];
  };
}

interface RedditSubredditInfo {
  data: {
    display_name: string;
    icon_img: string;
    community_icon: string;
    header_img: string | null;
  };
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
 * Convert Reddit preview.redd.it URLs to i.redd.it URLs when possible.
 * Reddit's i.redd.it CDN is more accessible than preview.redd.it.
 */
function convertRedditPreviewUrl(url: string): string {
  try {
    // Convert preview.redd.it to i.redd.it
    if (url.includes("preview.redd.it")) {
      const urlObj = new URL(url);
      // Extract the filename from the path
      const pathParts = urlObj.pathname.split("/");
      const filename = pathParts[pathParts.length - 1];

      // Build i.redd.it URL (remove query params as they're often signatures)
      const newUrl = `https://i.redd.it/${filename}`;
      logger.debug(
        { original: url, converted: newUrl },
        "Converting Reddit preview URL",
      );
      return newUrl;
    }
    return url;
  } catch (error) {
    logger.debug({ error, url }, "Failed to convert Reddit preview URL");
    return url;
  }
}

/**
 * Get appropriate referer header for Reddit URLs.
 * For Reddit URLs, use reddit.com. For others, use the domain of the URL.
 */
function getRedditRefererHeader(url: string): string {
  try {
    const urlObj = new URL(url);

    // Special handling for Reddit domains
    if (
      urlObj.hostname.includes("redd.it") ||
      urlObj.hostname.includes("reddit.com")
    ) {
      return "https://www.reddit.com";
    }

    // For other domains, use the origin
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    logger.debug({ error, url }, "Failed to determine referer");
    return "https://www.reddit.com"; // Safe fallback for Reddit
  }
}

/**
 * Fetch subreddit information including icon.
 */
async function fetchSubredditInfo(
  subreddit: string,
  userId: number,
): Promise<{ iconUrl: string | null }> {
  try {
    const accessToken = await getRedditAccessToken(userId);
    const url = `https://oauth.reddit.com/r/${subreddit}/about`;
    const response = await axios.get<RedditSubredditInfo>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });

    const subredditData = response.data.data;
    // Prefer icon_img, fall back to community_icon
    const iconUrl = fixRedditMediaUrl(
      subredditData.icon_img || subredditData.community_icon || null,
    );

    if (iconUrl) {
      logger.debug({ subreddit, iconUrl }, "Fetched subreddit icon");
    }

    return { iconUrl };
  } catch (error) {
    logger.warn({ error, subreddit }, "Failed to fetch subreddit info");
    return { iconUrl: null };
  }
}

/**
 * Extract subreddit name from URL or identifier.
 */
function normalizeSubreddit(identifier: string): string {
  identifier = identifier.trim();

  // Extract from URL
  const urlMatch = identifier.match(/(?:reddit\.com)?\/r\/([a-zA-Z0-9_]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Remove r/ or /r/ prefix
  if (identifier.startsWith("/r/")) {
    return identifier.slice(3);
  }
  if (identifier.startsWith("r/")) {
    return identifier.slice(2);
  }

  return identifier;
}

/**
 * Extract post ID and subreddit from Reddit URL.
 * Format: https://reddit.com/r/{subreddit}/comments/{postId}/...
 */
function extractPostInfoFromUrl(url: string): {
  subreddit: string | null;
  postId: string | null;
} {
  const match = url.match(/\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9]+)/);
  return match
    ? { subreddit: match[1], postId: match[2] }
    : { subreddit: null, postId: null };
}

/**
 * Fetch a single Reddit post by ID.
 */
async function fetchRedditPost(
  subreddit: string,
  postId: string,
  userId: number,
): Promise<RedditPost["data"] | null> {
  try {
    const accessToken = await getRedditAccessToken(userId);
    const response = await axios.get(
      `https://oauth.reddit.com/r/${subreddit}/comments/${postId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      },
    );

    // Reddit comments API returns: [0] = post data, [1] = comments data
    return response.data?.[0]?.data?.children?.[0]?.data || null;
  } catch (error) {
    logger.warn({ error, subreddit, postId }, "Error fetching Reddit post");
    return null;
  }
}

/**
 * Validate subreddit name.
 */
function validateSubreddit(subreddit: string): {
  valid: boolean;
  error?: string;
} {
  if (!subreddit) {
    return { valid: false, error: "Subreddit is required" };
  }

  // Subreddit names: 2-21 characters, alphanumeric and underscores only
  if (!/^[a-zA-Z0-9_]{2,21}$/.test(subreddit)) {
    return {
      valid: false,
      error:
        "Invalid subreddit name. Use 2-21 alphanumeric characters or underscores.",
    };
  }

  return { valid: true };
}

/**
 * Convert Reddit markdown to HTML.
 * Handles Reddit-specific markdown extensions like ^superscript,
 * ~~strikethrough~~, >!spoilers!<, and Giphy embeds.
 * Then converts standard markdown to HTML using marked library.
 */
async function convertRedditMarkdown(text: string): Promise<string> {
  if (!text) return "";

  // Handle Reddit preview images
  text = text.replace(
    /(?<!\[\(])https?:\/\/preview\.redd\.it\/[^\s\)]+/g,
    (match) => `<img src="${match}" alt="Reddit preview image">`,
  );

  // Convert markdown links with preview.redd.it URLs to image tags
  text = text.replace(
    /\[([^\]]*)\]\((https?:\/\/preview\.redd\.it\/[^\)]+)\)/g,
    (_, alt, url) =>
      `<img src="${url}" alt="${alt || "Reddit preview image"}">`,
  );

  // Handle Giphy images
  text = text.replace(
    /!\[([^\]]*)\]\(giphy\|([a-zA-Z0-9]+)(?:\|[^\)]+)?\)/gi,
    (_, __, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  text = text.replace(
    /<img\s+[^>]*src=\s*["']giphy\|([^"'\|]+)[^"']*["'][^>]*>/gi,
    (_, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  text = text.replace(
    /(?<!["'])giphy\|([a-zA-Z0-9]+)(?!["'])/g,
    (_, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  // Handle Reddit-specific superscript syntax (before markdown conversion)
  text = text.replace(/\^(\w+)/g, "<sup>$1</sup>");
  text = text.replace(/\^\(([^)]+)\)/g, "<sup>$1</sup>");

  // Handle strikethrough (before markdown conversion)
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Handle spoiler syntax (before markdown conversion)
  text = text.replace(
    />!(.+?)!</g,
    '<span class="spoiler" style="background: #000; color: #000;">$1</span>',
  );

  // Convert markdown to HTML using marked
  // Note: strikethrough and superscript are already handled above,
  // but marked will handle other markdown features like headers, lists, links, etc.
  const htmlContent = await marked.parse(text);

  return htmlContent as string;
}

/**
 * Extract thumbnail URL from Reddit post.
 */
function extractThumbnailUrl(post: RedditPost["data"]): string | null {
  try {
    // Check if submission has a valid thumbnail URL
    if (
      post.thumbnail &&
      !["self", "default", "nsfw", "spoiler"].includes(post.thumbnail)
    ) {
      if (post.thumbnail.startsWith("http")) {
        return post.thumbnail;
      }
      if (post.thumbnail.startsWith("/")) {
        return `https://reddit.com${post.thumbnail}`;
      }
    }

    // Try to get from preview data
    if (post.preview?.images?.[0]?.source?.url) {
      const decoded = decodeURIComponent(post.preview.images[0].source.url);
      return fixRedditMediaUrl(decoded);
    }

    // For image posts, use the URL directly if it's an image
    if (post.url) {
      const url = post.url.toLowerCase();
      if (
        [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
          url.endsWith(ext),
        )
      ) {
        return post.url;
      }
    }

    // For video posts, try to get preview
    if (post.url?.includes("v.redd.it")) {
      const previewUrl = extractRedditVideoPreview(post);
      if (previewUrl) {
        return previewUrl;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error }, "Could not extract thumbnail URL");
    return null;
  }
}

/**
 * Extract high-quality header image URL from a Reddit post.
 * Prioritizes YouTube videos for embedding, then high-quality images suitable for use as header images.
 */
function extractHeaderImageUrl(post: RedditPost["data"]): string | null {
  try {
    // Priority 0: Check for YouTube videos (highest priority - embed instead of image)
    // Check post URL first
    if (post.url) {
      const videoId = extractYouTubeVideoId(post.url);
      if (videoId) {
        logger.debug(
          { url: post.url, videoId },
          "Found YouTube video in post URL",
        );
        return post.url; // Return YouTube URL for embedding
      }
    }

    // Check URLs in selftext for YouTube videos
    if (post.is_self && post.selftext) {
      const urls = extractUrlsFromText(post.selftext);
      for (const url of urls) {
        const videoId = extractYouTubeVideoId(url);
        if (videoId) {
          logger.debug({ url, videoId }, "Found YouTube video in selftext");
          return url; // Return YouTube URL for embedding
        }
      }
    }

    // Priority 1: Preview source images (highest quality)
    if (post.preview?.images?.[0]?.source?.url) {
      const decoded = decodeURIComponent(post.preview.images[0].source.url);
      const headerUrl = fixRedditMediaUrl(decoded);
      logger.debug({ url: headerUrl }, "Extracted header image from preview");
      return headerUrl;
    }

    // Priority 2: Gallery posts - get first high-quality image
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
            const gifUrl = fixRedditMediaUrl(decoded);
            logger.debug(
              { url: gifUrl },
              "Extracted header image from gallery GIF",
            );
            return gifUrl;
          } else if (mediaInfo.s?.mp4) {
            const decoded = decodeURIComponent(mediaInfo.s.mp4);
            const mp4Url = fixRedditMediaUrl(decoded);
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
          const imageUrl = fixRedditMediaUrl(decoded);
          logger.debug(
            { url: imageUrl },
            "Extracted header image from gallery",
          );
          return imageUrl;
        }
      }
    }

    // Priority 3: Direct image posts - use URL directly
    if (post.url) {
      const url = post.url.toLowerCase();
      if (
        [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
          url.endsWith(ext),
        )
      ) {
        logger.debug({ url: post.url }, "Using direct image URL as header");
        return post.url;
      }
    }

    // Priority 4: Video posts - use preview
    if (post.url?.includes("v.redd.it")) {
      const previewUrl = extractRedditVideoPreview(post);
      if (previewUrl) {
        logger.debug({ url: previewUrl }, "Using video preview as header");
        return previewUrl;
      }
    }

    // Priority 5: Fall back to thumbnail extraction
    const thumbnailUrl = extractThumbnailUrl(post);
    if (thumbnailUrl) {
      logger.debug(
        { url: thumbnailUrl },
        "Falling back to thumbnail as header",
      );
      return thumbnailUrl;
    }

    // Priority 6: If no image found, return submission URL to extract image from it
    // This will be processed by standardizeContentFormat() which will try to extract
    // an image from the URL using extract_image_from_url()
    if (post.url) {
      const url = post.url;
      // Only return URL if it's not already an image file (already checked in Priority 3)
      // and not a video (already checked in Priority 4)
      if (
        ![".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
          url.toLowerCase().endsWith(ext),
        ) &&
        !url.includes("v.redd.it")
      ) {
        logger.debug(
          { url },
          "No image found, will extract from submission URL",
        );
        return url;
      }
    }

    // Priority 7: Extract URLs from text post selftext and try to find images
    // Only if no better image was found above
    if (post.is_self && post.selftext) {
      const urls = extractUrlsFromText(post.selftext);
      if (urls.length > 0) {
        logger.debug(
          { count: urls.length },
          "Found URL(s) in selftext, checking for images",
        );
        // Try each URL - prioritize direct image URLs, then other URLs
        // The actual image extraction will be done by standardizeContentFormat()
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

/**
 * Extract preview/thumbnail image URL from a Reddit video post.
 */
function extractRedditVideoPreview(post: RedditPost["data"]): string | null {
  try {
    if (!post.preview?.images?.[0]?.source?.url) {
      return null;
    }

    const decoded = decodeURIComponent(post.preview.images[0].source.url);
    const previewUrl = fixRedditMediaUrl(decoded);
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
function extractAnimatedGifUrl(post: RedditPost["data"]): string | null {
  try {
    if (!post.preview?.images?.[0]) {
      return null;
    }

    const imageData = post.preview.images[0];

    if (imageData.variants?.gif?.source?.url) {
      const decoded = decodeURIComponent(imageData.variants.gif.source.url);
      const gifUrl = fixRedditMediaUrl(decoded);
      logger.debug({ url: gifUrl }, "Extracted animated GIF URL");
      return gifUrl;
    }

    if (imageData.variants?.mp4?.source?.url) {
      const decoded = decodeURIComponent(imageData.variants.mp4.source.url);
      const mp4Url = fixRedditMediaUrl(decoded);
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
 * Extract URLs from Reddit post text (selftext).
 * Handles both plain URLs and markdown links [text](url).
 */
function extractUrlsFromText(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];

  // Pattern for markdown links: [text](url)
  const markdownLinkPattern = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
  let match;
  while ((match = markdownLinkPattern.exec(text)) !== null) {
    urls.push(match[2]);
  }

  // Pattern for plain URLs: http:// or https://
  // This regex matches URLs but avoids matching URLs already found in markdown links
  const plainUrlPattern = /(?<!\]\()(https?:\/\/[^\s\)]+)/g;
  while ((match = plainUrlPattern.exec(text)) !== null) {
    // Remove trailing punctuation that might be part of the sentence
    const url = match[1].replace(/[.,;:!?)]+$/, "");
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Format a single comment as HTML with link.
 */
async function formatCommentHtml(
  comment: RedditComment["data"],
): Promise<string> {
  const author = comment.author || "[deleted]";
  const body = await convertRedditMarkdown(comment.body || "");
  const commentUrl = `https://reddit.com${comment.permalink}`;

  return `
<blockquote>
<p><strong>${escapeHtml(author)}</strong> | <a href="${commentUrl}">source</a></p>
<div>${body}</div>
</blockquote>
`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Fetch comments for a Reddit post.
 */
async function fetchPostComments(
  subreddit: string,
  postId: string,
  commentLimit: number,
  userId: number,
): Promise<RedditComment["data"][]> {
  try {
    const accessToken = await getRedditAccessToken(userId);
    const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}`;
    const response = await axios.get(url, {
      params: {
        sort: "best", // Match Python's comment_sort = "best"
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });

    // Reddit comments API returns an array with two items:
    // [0] = post data
    // [1] = comments data
    if (!Array.isArray(response.data) || response.data.length < 2) {
      return [];
    }

    const commentsData = response.data[1];
    if (!commentsData?.data?.children) {
      return [];
    }

    // Flatten comment tree and sort by score
    const allComments: RedditComment["data"][] = [];
    const flattenComments = (comments: RedditComment[]) => {
      for (const comment of comments) {
        if (
          comment.data.body &&
          comment.data.body !== "[deleted]" &&
          comment.data.body !== "[removed]"
        ) {
          allComments.push(comment.data);
        }
        if (comment.data.replies?.data?.children) {
          flattenComments(comment.data.replies.data.children);
        }
      }
    };

    flattenComments(commentsData.data.children);

    // Sort by score (descending) and filter out bots
    const filtered = allComments
      .filter((comment) => {
        const author = comment.author?.toLowerCase() || "";
        return (
          !author.endsWith("_bot") &&
          !author.endsWith("-bot") &&
          author !== "automoderator"
        );
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, commentLimit * 2); // Get more than needed to account for filtering

    return filtered.slice(0, commentLimit);
  } catch (error) {
    logger.warn({ error, subreddit, postId }, "Error fetching Reddit comments");
    return [];
  }
}

/**
 * Build post content with comments.
 */
async function buildPostContent(
  post: RedditPost["data"],
  commentLimit: number,
  subreddit: string,
  userId: number,
): Promise<string> {
  const contentParts: string[] = [];

  // Post content (selftext or link)
  if (post.is_self && post.selftext) {
    // Text post - convert Reddit markdown to HTML
    const selftextHtml = await convertRedditMarkdown(post.selftext);
    contentParts.push(`<div>${selftextHtml}</div>`);
  } else if (
    post.is_gallery &&
    post.media_metadata &&
    post.gallery_data?.items
  ) {
    // Reddit gallery - extract all images at high resolution
    for (const item of post.gallery_data.items) {
      const mediaId = item.media_id;
      const caption = item.caption || "";
      const mediaInfo = post.media_metadata[mediaId];

      if (mediaInfo) {
        // Check if it's an animated GIF
        if (mediaInfo.e === "AnimatedImage") {
          const gifUrl = mediaInfo.s?.gif || mediaInfo.s?.mp4;
          if (gifUrl) {
            const decoded = decodeURIComponent(gifUrl);
            const fixedUrl = fixRedditMediaUrl(decoded);
            if (caption) {
              contentParts.push(
                `<figure><img src="${fixedUrl}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`,
              );
            } else {
              contentParts.push(
                `<p><img src="${fixedUrl}" alt="Animated GIF"></p>`,
              );
            }
          }
        } else if (mediaInfo.e === "Image" && mediaInfo.s?.u) {
          const decoded = decodeURIComponent(mediaInfo.s.u);
          const imageUrl = fixRedditMediaUrl(decoded);
          if (caption) {
            contentParts.push(
              `<figure><img src="${imageUrl}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`,
            );
          } else {
            contentParts.push(
              `<p><img src="${imageUrl}" alt="Gallery image"></p>`,
            );
          }
        }
      }
    }
  } else if (post.url) {
    // Link post
    const url = post.url;

    if (
      url.toLowerCase().endsWith(".gif") ||
      url.toLowerCase().endsWith(".gifv")
    ) {
      const gifUrl = extractAnimatedGifUrl(post);
      if (gifUrl) {
        contentParts.push(`<p><img src="${gifUrl}" alt="Animated GIF"></p>`);
      } else {
        const finalUrl = url.toLowerCase().endsWith(".gifv")
          ? url.slice(0, -1)
          : url;
        const fixedUrl = fixRedditMediaUrl(finalUrl);
        contentParts.push(`<p><img src="${fixedUrl}" alt="Animated GIF"></p>`);
      }
    } else if (
      [".jpg", ".jpeg", ".png", ".webp"].some((ext) =>
        url.toLowerCase().endsWith(ext),
      )
    ) {
      const fixedUrl = fixRedditMediaUrl(url);
      contentParts.push(`<p><img src="${fixedUrl}" alt="Post image"></p>`);
    } else if (url.includes("v.redd.it")) {
      const previewUrl = extractRedditVideoPreview(post);
      if (previewUrl) {
        contentParts.push(
          `<p><img src="${previewUrl}" alt="Video thumbnail"></p>`,
        );
      }
      contentParts.push(`<p><a href="${url}">▶ View Video</a></p>`);
    } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
      // Create a link - standardize_format will convert it to an embed
      contentParts.push(`<p><a href="${url}">▶ View Video on YouTube</a></p>`);
    } else {
      contentParts.push(`<p><a href="${url}">${escapeHtml(url)}</a></p>`);
    }
  }

  // Comments section
  const permalink = `https://reddit.com${post.permalink}`;
  contentParts.push(
    `<h3><a href="${permalink}" target="_blank" rel="noopener">Comments</a></h3>`,
  );

  // Fetch and format comments
  if (commentLimit > 0) {
    const comments = await fetchPostComments(
      subreddit,
      post.id,
      commentLimit,
      userId,
    );
    if (comments.length > 0) {
      const commentHtmls = await Promise.all(comments.map(formatCommentHtml));
      contentParts.push(commentHtmls.join(""));
    } else {
      contentParts.push("<p><em>No comments yet.</em></p>");
    }
  } else {
    contentParts.push("<p><em>Comments disabled.</em></p>");
  }

  return contentParts.join("");
}

export class RedditAggregator extends BaseAggregator {
  override readonly id = "reddit";
  override readonly type = "social" as const;
  override readonly name = "Reddit";
  override readonly url = "https://www.reddit.com/r/example";
  override readonly description =
    "Reddit - Social news aggregation and discussion website organized into communities (subreddits).";

  override readonly identifierType = "string" as const;
  override readonly identifierLabel = "Subreddit";
  override readonly identifierDescription =
    "Enter the subreddit name (e.g., 'python', 'programming'). You can also use 'r/python' or a full Reddit URL.";
  override readonly identifierPlaceholder = "python";
  override readonly identifierEditable = true;
  override readonly prefillName = false;
  override readonly defaultDailyLimit = 20;

  // Store subreddit icon URL for feed icon collection
  private subredditIconUrl: string | null = null;

  override readonly options = {
    sort_by: {
      type: "choice" as const,
      label: "Sort Method",
      helpText: "How to sort posts: hot (default), new, top, or rising",
      default: "hot",
      required: false,
      choices: [
        ["hot", "Hot"],
        ["new", "New"],
        ["top", "Top"],
        ["rising", "Rising"],
      ] as Array<[string, string]>,
    },
    comment_limit: {
      type: "integer" as const,
      label: "Comment Limit",
      helpText: "Number of top comments to fetch per post",
      default: 10,
      required: false,
      min: 0,
      max: 50,
    },
  };

  /**
   * Validate subreddit identifier.
   */
  async validateIdentifier(
    identifier: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const subreddit = normalizeSubreddit(identifier);
    return validateSubreddit(subreddit);
  }

  /**
   * Normalize subreddit identifier.
   */
  normalizeIdentifier(identifier: string): string {
    return normalizeSubreddit(identifier);
  }

  /**
   * Get Reddit user agent from user settings or use default.
   * Also validates that Reddit is enabled and credentials are configured.
   */
  private async getUserAgent(): Promise<string> {
    if (!this.feed?.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const userId = this.feed.userId;

    try {
      const settings = await getUserSettings(userId);

      // Validate Reddit is enabled
      if (!settings.redditEnabled) {
        throw new Error(
          "Reddit is not enabled. Please enable Reddit in your settings and configure API credentials.",
        );
      }

      // Validate credentials are present
      if (!settings.redditClientId || !settings.redditClientSecret) {
        throw new Error(
          "Reddit API credentials not configured. Please set Client ID and Client Secret in your settings.",
        );
      }

      return settings.redditUserAgent || "Yana/1.0";
    } catch (error) {
      if (error instanceof Error && error.message.includes("Reddit")) {
        throw error; // Re-throw Reddit-specific errors
      }
      logger.warn(
        { error },
        "Could not get user settings, using default user agent",
      );
      throw new Error("Could not get user settings for Reddit API access.");
    }
  }

  /**
   * Collect feed icon URL during aggregation.
   */
  override async collectFeedIcon(): Promise<string | null> {
    return this.subredditIconUrl;
  }

  /**
   * Validate subreddit identifier.
   */
  protected override async validate(): Promise<void> {
    await super.validate();

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const subreddit = normalizeSubreddit(this.feed.identifier);
    if (!subreddit) {
      throw new Error(
        `Could not extract subreddit from identifier: ${this.feed.identifier}`,
      );
    }

    const validation = validateSubreddit(subreddit);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid subreddit");
    }
  }

  /**
   * Apply rate limiting for Reddit API.
   */
  protected override async applyRateLimiting(): Promise<void> {
    // Reddit API is generally permissive, but we still apply default rate limiting
    await super.applyRateLimiting();
  }

  /**
   * Fetch Reddit posts from API.
   */
  protected override async fetchSourceData(limit?: number): Promise<unknown> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "fetchSourceData",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
        limit,
      },
      "Fetching Reddit posts",
    );

    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const subreddit = normalizeSubreddit(this.feed.identifier);
    if (!subreddit) {
      throw new Error(
        `Could not extract subreddit from identifier: ${this.feed.identifier}`,
      );
    }

    const sortBy = this.getOption("sort_by", "hot") as string;

    if (!this.feed.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const userId = this.feed.userId;

    // Validate Reddit is enabled and get user agent (validates credentials)
    await this.getUserAgent();

    // Fetch subreddit info to get icon for feed thumbnail
    const subredditInfo = await fetchSubredditInfo(subreddit, userId);

    // Store subreddit icon URL for feed icon collection
    this.subredditIconUrl = subredditInfo.iconUrl;
    // Legacy support: also store in private property for backwards compatibility
    (this as any).__subredditIconUrl = subredditInfo.iconUrl;

    // Calculate desired article count
    const desiredArticleCount = limit || 25;

    // Fetch 2-3x more posts than needed to account for filtering
    // (AutoModerator posts, old posts, etc.)
    // Reddit API max is 100
    const fetchLimit = Math.min(desiredArticleCount * 3, 100);

    // Apply rate limiting
    await this.applyRateLimiting();

    try {
      // Get access token for authenticated API call
      const accessToken = await getRedditAccessToken(userId);

      // Fetch posts from Reddit OAuth API
      const url = `https://oauth.reddit.com/r/${subreddit}/${sortBy}`;
      const response = await axios.get(url, {
        params: {
          limit: fetchLimit,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 30000,
      });

      const posts: RedditPost[] = response.data.data.children || [];

      const elapsed = Date.now() - startTime;
      this.logger.info(
        {
          step: "fetchSourceData",
          subStep: "complete",
          aggregator: this.id,
          feedId: this.feed?.id,
          postCount: posts.length,
          elapsed,
        },
        "Reddit posts fetched",
      );

      return { posts, subreddit, subredditInfo };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(
        {
          step: "fetchSourceData",
          subStep: "error",
          aggregator: this.id,
          feedId: this.feed?.id,
          error: error instanceof Error ? error : new Error(String(error)),
          elapsed,
        },
        "Error fetching Reddit posts",
      );
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(
            `Subreddit 'r/${subreddit}' does not exist or is private.`,
          );
        }
        if (error.response?.status === 403) {
          throw new Error(`Subreddit 'r/${subreddit}' is private or banned.`);
        }
      }
      throw error;
    }
  }

  /**
   * Parse Reddit posts to RawArticle[].
   */
  protected override async parseToRawArticles(
    sourceData: unknown,
  ): Promise<RawArticle[]> {
    const startTime = Date.now();
    this.logger.info(
      {
        step: "parseToRawArticles",
        subStep: "start",
        aggregator: this.id,
        feedId: this.feed?.id,
      },
      "Parsing Reddit posts",
    );

    const { posts, subreddit, subredditInfo } = sourceData as {
      posts: RedditPost[];
      subreddit: string;
      subredditInfo: { iconUrl: string | null };
    };

    if (posts.length === 0) {
      this.logger.warn(
        {
          step: "parseToRawArticles",
          subStep: "complete",
          aggregator: this.id,
          feedId: this.feed?.id,
          subreddit,
        },
        "No posts found in subreddit",
      );
      return [];
    }

    const commentLimit = this.getOption("comment_limit", 10) as number;

    if (!this.feed?.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const userId = this.feed.userId;
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const articles: RawArticle[] = [];

    for (const post of posts) {
      const postData = post.data;
      const postDate = new Date(postData.created_utc * 1000);
      const permalink = `https://reddit.com${postData.permalink}`;

      const rawContent = await buildPostContent(
        postData,
        commentLimit,
        subreddit,
        userId,
      );
      const headerImageUrl = extractHeaderImageUrl(postData);
      const thumbnailUrl = extractThumbnailUrl(postData);

      // For article thumbnail: use header image if available, otherwise use thumbnail
      const articleThumbnailUrl = headerImageUrl || thumbnailUrl || undefined;

      // Set media_url for Reddit videos
      let mediaUrl: string | undefined;
      if (postData.is_video && postData.url?.includes("v.redd.it")) {
        mediaUrl = `${permalink}/embed`;
      }

      articles.push({
        title: postData.title,
        url: permalink,
        published: postDate,
        content: rawContent, // Will be processed in processContent
        summary: postData.selftext || "",
        author: postData.author,
        score: postData.score,
        thumbnailUrl: articleThumbnailUrl,
        mediaUrl,
        externalId: postData.id,
        // Store headerImageUrl for use in processContent
        ...(headerImageUrl ? { headerImageUrl } : {}),
      } as RawArticle & { headerImageUrl?: string });
    }

    const elapsed = Date.now() - startTime;
    this.logger.info(
      {
        step: "parseToRawArticles",
        subStep: "complete",
        aggregator: this.id,
        feedId: this.feed?.id,
        articleCount: articles.length,
        elapsed,
      },
      "Reddit posts parsed",
    );

    return articles;
  }

  /**
   * Check if article should be skipped (AutoModerator, old posts).
   */
  protected override shouldSkipArticle(article: RawArticle): boolean {
    // Check base skip logic first
    if (super.shouldSkipArticle(article)) {
      return true;
    }

    // Skip AutoModerator posts
    if (article.author === "AutoModerator") {
      this.logger.debug(
        {
          step: "filterArticles",
          subStep: "shouldSkipArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          reason: "AutoModerator",
        },
        "Skipping AutoModerator post",
      );
      return true;
    }

    // Skip if too old (older than 2 months)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    if (article.published < twoMonthsAgo) {
      this.logger.debug(
        {
          step: "filterArticles",
          subStep: "shouldSkipArticle",
          aggregator: this.id,
          feedId: this.feed?.id,
          url: article.url,
          reason: "too_old",
          date: article.published,
        },
        "Skipping old post",
      );
      return true;
    }

    return false;
  }

  /**
   * Fetch article content from URL.
   * Override to fetch Reddit posts via API (including comments) instead of web scraping.
   * Always uses API - never falls back to web scraping.
   */
  protected override async fetchArticleContentInternal(
    url: string,
    article: RawArticle,
  ): Promise<string> {
    const { subreddit, postId } = extractPostInfoFromUrl(url);

    if (!subreddit || !postId) {
      throw new Error(
        `Invalid Reddit URL format: ${url}. Expected format: /r/{subreddit}/comments/{postId}/...`,
      );
    }

    if (!this.feed?.userId) {
      throw new Error(
        "Feed must have a userId to use Reddit API. Reddit requires authenticated API access.",
      );
    }

    const postData = await fetchRedditPost(subreddit, postId, this.feed.userId);

    if (!postData) {
      throw new Error(
        `Failed to fetch Reddit post ${postId} from r/${subreddit} via API`,
      );
    }

    // Build content with comments
    const content = await buildPostContent(
      postData,
      this.getOption("comment_limit", 10) as number,
      subreddit,
      this.feed.userId,
    );

    // Extract header image URL and store it in the article for processContent
    // This will be used by processContent to add the header image
    const headerImageUrl = extractHeaderImageUrl(postData);
    if (headerImageUrl) {
      (article as RawArticle & { headerImageUrl?: string }).headerImageUrl =
        headerImageUrl;
    }

    return content;
  }

  /**
   * Extract content from HTML.
   * Override to skip extraction for Reddit posts.
   * Content is always fetched via API (buildPostContent) and returns HTML fragments.
   */
  protected override async extractContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    // Reddit content is always formatted HTML fragments from buildPostContent (API)
    // No extraction needed - return as-is
    return html;
  }

  /**
   * Process content with Reddit-specific formatting.
   */
  protected override async processContent(
    html: string,
    article: RawArticle,
  ): Promise<string> {
    const startTime = Date.now();
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
      },
      "Processing Reddit content",
    );

    // Get header image URL if stored
    const headerImageUrl = (article as RawArticle & { headerImageUrl?: string })
      .headerImageUrl;

    const generateTitleImage = this.feed?.generateTitleImage ?? true;
    const addSourceFooter = this.feed?.addSourceFooter ?? true;

    // Use standardizeContentFormat with Reddit-specific header image
    const processed = await standardizeContentFormat(
      html,
      article,
      article.url,
      generateTitleImage,
      addSourceFooter,
      headerImageUrl,
    );

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      {
        step: "enrichArticles",
        subStep: "processContent",
        aggregator: this.id,
        feedId: this.feed?.id,
        url: article.url,
        elapsed,
      },
      "Reddit content processed",
    );

    return processed;
  }
}
