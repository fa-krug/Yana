/**
 * Shared Reddit type definitions.
 */

/**
 * Reddit post data structure from API.
 */
export interface RedditPostData {
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
  crosspost_parent_list?: Array<RedditPostData & { subreddit?: string }>;
}

/**
 * Reddit API response wrapper for posts.
 */
export interface RedditPost {
  data: RedditPostData;
}
