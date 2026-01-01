/**
 * Reddit post fetching utilities.
 */

import axios from "axios";

import { logger } from "@server/utils/logger";

import { getRedditAccessToken } from "./auth";
import type { RedditPostData } from "./types";

/**
 * Fetch a single Reddit post by ID.
 */
export async function fetchRedditPost(
  subreddit: string,
  postId: string,
  userId: number,
): Promise<RedditPostData | null> {
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
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        logger.warn(
          { subreddit, postId },
          `Reddit post ${postId} in r/${subreddit} not found`,
        );
        return null;
      }
      if (error.response?.status === 403) {
        logger.warn(
          { subreddit, postId },
          `Access forbidden to post ${postId} in r/${subreddit}`,
        );
        return null;
      }
      if (error.response?.status === 401) {
        logger.error(
          { subreddit, postId },
          "Reddit authentication failed while fetching post",
        );
        throw new Error(
          "Reddit authentication failed. Please check your API credentials.",
        );
      }
      logger.warn(
        {
          error: error.message,
          status: error.response?.status,
          subreddit,
          postId,
        },
        "Error fetching Reddit post",
      );
    } else {
      logger.warn(
        { error, subreddit, postId },
        "Unexpected error fetching Reddit post",
      );
    }
    return null;
  }
}
