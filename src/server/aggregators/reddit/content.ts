/**
 * Reddit content building utilities.
 */

import { logger } from "@server/utils/logger";

import { ArticleSkipError } from "../base/exceptions";

import { fetchPostComments, formatCommentHtml } from "./comments";
import { convertRedditMarkdown, escapeHtml } from "./markdown";
import { processLinkMedia } from "./media-handlers";
import type { RedditPostData } from "./types";
import { decodeHtmlEntitiesInUrl } from "./urls";

/**
 * Add selftext part to content.
 */
async function addSelftextPart(
  post: RedditPostData,
  contentParts: string[],
): Promise<void> {
  if (post.selftext) {
    const selftextHtml = await convertRedditMarkdown(post.selftext);
    contentParts.push(`<div>${selftextHtml}</div>`);
  }
}

/**
 * Process a single gallery item.
 */
function processGalleryItem(
  item: { media_id: string; caption?: string },
  post: RedditPostData,
): string | null {
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

  const fixedUrl = fixRedditMediaUrl(
    decodeHtmlEntitiesInUrl(decodeURIComponent(mediaUrl)),
  );
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
  if (!post.is_gallery || !post.media_metadata || !post.gallery_data?.items)
    return;

  for (const item of post.gallery_data.items) {
    const html = processGalleryItem(item, post);
    if (html) contentParts.push(html);
  }
}

/**
 * Add link media to content.
 */
function addLinkMedia(
  post: RedditPostData,
  contentParts: string[],
  isCrossPost: boolean,
): void {
  if (!post.url || post.is_gallery) return;

  const url = decodeHtmlEntitiesInUrl(post.url);

  // Try media handlers in order
  if (processLinkMedia(post, url, contentParts)) return;

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
  const commentSectionParts: string[] = [
    `<h3><a href="${permalink}" target="_blank" rel="noopener">Comments</a></h3>`,
  ];

  if (commentLimit > 0) {
    try {
      const comments = await fetchPostComments(
        subreddit,
        post.id,
        commentLimit,
        userId,
      );
      if (comments.length > 0) {
        const commentHtmls = await Promise.all(comments.map(formatCommentHtml));
        commentSectionParts.push(commentHtmls.join(""));
      } else {
        commentSectionParts.push("<p><em>No comments yet.</em></p>");
      }
    } catch (error) {
      if (error instanceof ArticleSkipError) throw error;
      logger.warn(
        { error, subreddit, postId: post.id },
        "Failed to fetch comments",
      );
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
