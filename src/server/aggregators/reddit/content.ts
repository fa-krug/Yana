/**
 * Reddit content building utilities.
 */

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../base/exceptions";

import { fetchPostComments, formatCommentHtml } from "./comments";
import {
  extractAnimatedGifUrl,
  extractRedditVideoPreview,
  wouldUseVRedditAsHeader,
  wouldUseDirectImageAsHeader,
  wouldUseYouTubeAsHeader,
  wouldUseGifAsHeader,
} from "./images";
import { convertRedditMarkdown, escapeHtml } from "./markdown";
import type { RedditPostData } from "./types";
import { fixRedditMediaUrl, decodeHtmlEntitiesInUrl } from "./urls";

/**
 * Add selftext part to content.
 */
async function addSelftextPart(post: RedditPostData, contentParts: string[]): Promise<void> {
  if (post.selftext) {
    const selftextHtml = await convertRedditMarkdown(post.selftext);
    contentParts.push(`<div>${selftextHtml}</div>`);
  }
}

/**
 * Process a single gallery item.
 */
function processGalleryItem(item: { media_id: string; caption?: string }, post: RedditPostData): string | null {
  const mediaInfo = post.media_metadata?.[item.media_id];
  if (!mediaInfo) return null;

  const isAnimated = mediaInfo.e === "AnimatedImage";
  let mediaUrl: string | undefined | null = null;
  if (isAnimated) {
    mediaUrl = mediaInfo.s?.gif || mediaInfo.s?.mp4;
  } else if (mediaInfo.e === "Image") {
    mediaUrl = mediaInfo.s?.u;
  }

  if (!mediaUrl) return null;

  const fixedUrl = fixRedditMediaUrl(decodeHtmlEntitiesInUrl(decodeURIComponent(mediaUrl)));
  const caption = item.caption || "";
  let alt = "Gallery image";
  if (caption) {
    alt = escapeHtml(caption);
  } else if (isAnimated) {
    alt = "Animated GIF";
  }

  if (caption) {
    return `<figure><img src="${fixedUrl}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`;
  }
  return `<p><img src="${fixedUrl}" alt="${alt}"></p>`;
}

/**
 * Add gallery media to content.
 */
function addGalleryMedia(post: RedditPostData, contentParts: string[]): void {
  if (!post.is_gallery || !post.media_metadata || !post.gallery_data?.items) return;

  for (const item of post.gallery_data.items) {
    const html = processGalleryItem(item, post);
    if (html) contentParts.push(html);
  }
}

/**
 * Handle GIF media in links.
 */
function handleGifMedia(post: RedditPostData, url: string, urlLower: string, contentParts: string[]): boolean {
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
 * Handle direct image media in links.
 */
function handleImageMedia(post: RedditPostData, url: string, urlLower: string, contentParts: string[]): boolean {
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].some((ext) => urlLower.endsWith(ext)) || urlLower.includes("i.redd.it");
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
 * Handle video and YouTube media in links.
 */
function handleVideoMedia(post: RedditPostData, url: string, urlLower: string, contentParts: string[]): boolean {
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
 * Add link media to content.
 */
function addLinkMedia(post: RedditPostData, contentParts: string[], isCrossPost: boolean): void {
  if (!post.url || post.is_gallery) return;

  const url = decodeHtmlEntitiesInUrl(post.url);
  const urlLower = url.toLowerCase();

  if (handleGifMedia(post, url, urlLower, contentParts)) return;
  if (handleImageMedia(post, url, urlLower, contentParts)) return;
  if (handleVideoMedia(post, url, urlLower, contentParts)) return;

  // Fallback link
  if (!isCrossPost && !post.is_self) {
    contentParts.push(`<p><a href="${url}">${escapeHtml(url)}</a></p>`);
  }
}

/**
 * Add comments section to content.
 */
async function addCommentsSection(
  post: RedditPostData,
  commentLimit: number,
  subreddit: string,
  userId: number,
  contentParts: string[],
): Promise<void> {
  const decodedPermalink = decodeHtmlEntitiesInUrl(post.permalink);
  const permalink = `https://reddit.com${decodedPermalink}`;
  const commentSectionParts: string[] = [`<h3><a href="${permalink}" target="_blank" rel="noopener">Comments</a></h3>`];

  if (commentLimit > 0) {
    try {
      const comments = await fetchPostComments(subreddit, post.id, commentLimit, userId);
      if (comments.length > 0) {
        const commentHtmls = await Promise.all(comments.map(formatCommentHtml));
        commentSectionParts.push(commentHtmls.join(""));
      } else {
        commentSectionParts.push("<p><em>No comments yet.</em></p>");
      }
    } catch (error) {
      if (error instanceof ArticleSkipError) throw error;
      logger.warn({ error, subreddit, postId: post.id }, "Failed to fetch comments");
      commentSectionParts.push("<p><em>Comments unavailable.</em></p>");
    }
  } else {
    commentSectionParts.push("<p><em>Comments disabled.</em></p>");
  }

  contentParts.push(`<section>${commentSectionParts.join("")}</section>`);
}

/**
 * Build post content with comments.
 */
export async function buildPostContent(
  post: RedditPostData,
  commentLimit: number,
  subreddit: string,
  userId: number,
  isCrossPost: boolean = false,
): Promise<string> {
  const contentParts: string[] = [];

  await addSelftextPart(post, contentParts);
  addGalleryMedia(post, contentParts);
  addLinkMedia(post, contentParts, isCrossPost);
  await addCommentsSection(post, commentLimit, subreddit, userId, contentParts);

  return contentParts.join("");
}