/**
 * Reddit post fetching utilities.
 */

import axios from "axios";
import { logger } from "../../utils/logger";
import { getRedditAccessToken } from "./auth";

/**
 * Reddit post interface.
 */
export interface RedditPost {
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

/**
 * Fetch a single Reddit post by ID.
 */
export async function fetchRedditPost(
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
