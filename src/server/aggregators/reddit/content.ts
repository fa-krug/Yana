/**
 * Reddit content building utilities.
 */

import { logger } from "@server/utils/logger";
import { convertRedditMarkdown, escapeHtml } from "./markdown";
import { fixRedditMediaUrl, decodeHtmlEntitiesInUrl } from "./urls";
import { extractAnimatedGifUrl, extractRedditVideoPreview } from "./images";
import { fetchPostComments, formatCommentHtml } from "./comments";
import { ArticleSkipError } from "../base/exceptions";

/**
 * Reddit post data interface.
 */
export interface RedditPostData {
  id: string;
  is_self: boolean;
  selftext?: string;
  url?: string;
  permalink: string;
  is_gallery?: boolean;
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
}

/**
 * Build post content with comments.
 */
export async function buildPostContent(
  post: RedditPostData,
  commentLimit: number,
  subreddit: string,
  userId: number,
): Promise<string> {
  const contentParts: string[] = [];

  // Post content (selftext or link)
  // Check for selftext first - image posts can have text descriptions too
  if (post.selftext) {
    // Text content - convert Reddit markdown to HTML
    const selftextHtml = await convertRedditMarkdown(post.selftext);
    contentParts.push(`<div>${selftextHtml}</div>`);
  }

  // Handle media content (images, galleries, videos)
  if (post.is_gallery && post.media_metadata && post.gallery_data?.items) {
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
            const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
            const fixedUrl = fixRedditMediaUrl(decodedEntities);
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
          const decodedEntities = decodeHtmlEntitiesInUrl(decoded);
          const imageUrl = fixRedditMediaUrl(decodedEntities);
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
    const decodedUrl = decodeHtmlEntitiesInUrl(post.url);
    const url = decodedUrl;

    if (
      url.toLowerCase().endsWith(".gif") ||
      url.toLowerCase().endsWith(".gifv")
    ) {
      // Try to get animated GIF URL first
      const gifUrl = extractAnimatedGifUrl(post as any);
      if (gifUrl) {
        const fixedUrl = fixRedditMediaUrl(gifUrl);
        if (fixedUrl) {
          contentParts.push(
            `<p><img src="${fixedUrl}" alt="Animated GIF"></p>`,
          );
        }
      } else {
        const finalUrl = url.toLowerCase().endsWith(".gifv")
          ? url.slice(0, -1)
          : url;
        const fixedUrl = fixRedditMediaUrl(finalUrl);
        if (fixedUrl) {
          contentParts.push(
            `<p><img src="${fixedUrl}" alt="Animated GIF"></p>`,
          );
        }
      }
    } else if (
      [".jpg", ".jpeg", ".png", ".webp"].some((ext) =>
        url.toLowerCase().endsWith(ext),
      )
    ) {
      // Direct image URL - just add as link, standardizeContentFormat will handle header element
      const fixedUrl = fixRedditMediaUrl(url);
      if (fixedUrl) {
        contentParts.push(
          `<p><a href="${fixedUrl}">${escapeHtml(fixedUrl)}</a></p>`,
        );
      }
    } else if (url.includes("v.redd.it")) {
      // Reddit video - extract preview
      const previewUrl = extractRedditVideoPreview(post as any);
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
      // For other URLs, just add as link - standardizeContentFormat will handle image extraction
      contentParts.push(`<p><a href="${url}">${escapeHtml(url)}</a></p>`);
    }
  }

  // Comments section
  const decodedPermalink = decodeHtmlEntitiesInUrl(post.permalink);
  const permalink = `https://reddit.com${decodedPermalink}`;
  const commentSectionParts: string[] = [
    `<h3><a href="${permalink}" target="_blank" rel="noopener">Comments</a></h3>`,
  ];

  // Fetch and format comments
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
      // Re-throw ArticleSkipError to propagate it up
      if (error instanceof ArticleSkipError) {
        throw error;
      }
      // For other errors, log and continue without comments
      logger.warn(
        { error, subreddit, postId: post.id },
        "Failed to fetch comments, continuing without them",
      );
      commentSectionParts.push("<p><em>Comments unavailable.</em></p>");
    }
  } else {
    commentSectionParts.push("<p><em>Comments disabled.</em></p>");
  }

  // Wrap comments in section tag
  contentParts.push(`<section>${commentSectionParts.join("")}</section>`);

  return contentParts.join("");
}
