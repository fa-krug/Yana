/**
 * Reddit article building helpers.
 *
 * Helper functions for building RawArticle objects from Reddit post data.
 */

import type { RawArticle } from "../base/types";

import type { RedditPostData } from "./types";
import { decodeHtmlEntitiesInUrl } from "./urls";

/**
 * Build the permalink URL for a Reddit post.
 */
export function buildPermalink(postData: RedditPostData): string {
  const decodedPermalink = decodeHtmlEntitiesInUrl(postData.permalink);
  return `https://reddit.com${decodedPermalink}`;
}

/**
 * Determine the media URL for a Reddit video post.
 */
export function extractVideoMediaUrl(postData: RedditPostData): string | undefined {
  if (!postData.is_video || !postData.url) {
    return undefined;
  }

  const decodedUrl = decodeHtmlEntitiesInUrl(postData.url);
  if (decodedUrl.includes("v.redd.it")) {
    const decodedPermalink = decodeHtmlEntitiesInUrl(postData.permalink);
    const normalizedPermalink = decodedPermalink.replace(/\/$/, "");
    return `https://vxreddit.com${normalizedPermalink}`;
  }

  return undefined;
}

/**
 * Select the best thumbnail URL for an article.
 */
export function selectArticleThumbnail(
  headerImageUrl: string | undefined,
  thumbnailUrl: string | undefined,
): string | undefined {
  return headerImageUrl || thumbnailUrl || undefined;
}

/**
 * Build a RawArticle from Reddit post data.
 */
export function buildArticleFromPost(
  postData: RedditPostData,
  content: string,
  thumbnailUrl: string | undefined,
  mediaUrl: string | undefined,
  headerImageUrl: string | undefined,
  numComments: number,
): RawArticle & { headerImageUrl?: string; num_comments?: number } {
  const postDate = new Date(postData.created_utc * 1000);

  return {
    title: postData.title,
    url: buildPermalink(postData),
    published: postDate,
    content,
    summary: postData.selftext || "",
    author: postData.author,
    score: postData.score,
    thumbnailUrl,
    mediaUrl,
    externalId: postData.id,
    ...(headerImageUrl ? { headerImageUrl } : {}),
    num_comments: numComments,
  };
}
