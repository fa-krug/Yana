/**
 * Reddit comment fetching and formatting utilities.
 */

import axios from "axios";
import { logger } from "@server/utils/logger";
import { getRedditAccessToken } from "./auth";
import { convertRedditMarkdown, escapeHtml } from "./markdown";
import { is4xxError } from "../base/utils/http-errors";
import { ArticleSkipError } from "../base/exceptions";

/**
 * Reddit comment interface.
 */
export interface RedditComment {
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

/**
 * Format a single comment as HTML with link.
 */
export async function formatCommentHtml(
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
 * Fetch comments for a Reddit post.
 */
export async function fetchPostComments(
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

    // Collect only top-level comments (direct replies to the post, not nested replies)
    const topLevelComments: RedditComment["data"][] = [];
    for (const comment of commentsData.data.children) {
      if (
        comment.data.body &&
        comment.data.body !== "[deleted]" &&
        comment.data.body !== "[removed]"
      ) {
        topLevelComments.push(comment.data);
      }
    }

    // Sort by score (descending) and filter out bots
    const filtered = topLevelComments
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
    // Check for 4xx errors - skip article on client errors
    const statusCode = is4xxError(error);
    if (statusCode !== null) {
      logger.warn(
        { error, subreddit, postId, statusCode },
        "4xx error fetching Reddit comments, skipping article",
      );
      throw new ArticleSkipError(
        `Failed to fetch Reddit comments: ${statusCode} ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        statusCode,
        error instanceof Error ? error : undefined,
      );
    }
    logger.warn({ error, subreddit, postId }, "Error fetching Reddit comments");
    return [];
  }
}
