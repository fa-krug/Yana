/**
 * Reddit post parsing utilities.
 */

import type { RawArticle } from "../base/types";
import { logger } from "../../utils/logger";
import { buildPostContent } from "./content";
import { extractHeaderImageUrl, extractThumbnailUrl } from "./images";
import { decodeHtmlEntitiesInUrl } from "./urls";

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
 * Parse Reddit posts to RawArticle[].
 */
export async function parseRedditPosts(
  posts: RedditPost[],
  subreddit: string,
  commentLimit: number,
  userId: number,
  aggregatorId: string,
  feedId: number | undefined,
): Promise<RawArticle[]> {
  const startTime = Date.now();
  logger.info(
    {
      step: "parseToRawArticles",
      subStep: "start",
      aggregator: aggregatorId,
      feedId,
    },
    "Parsing Reddit posts",
  );

  if (posts.length === 0) {
    logger.warn(
      {
        step: "parseToRawArticles",
        subStep: "complete",
        aggregator: aggregatorId,
        feedId,
        subreddit,
      },
      "No posts found in subreddit",
    );
    return [];
  }

  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const articles: RawArticle[] = [];

  for (const post of posts) {
    const postData = post.data;
    const postDate = new Date(postData.created_utc * 1000);
    const decodedPermalink = decodeHtmlEntitiesInUrl(postData.permalink);
    const permalink = `https://reddit.com${decodedPermalink}`;

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
    if (postData.is_video && postData.url) {
      const decodedUrl = decodeHtmlEntitiesInUrl(postData.url);
      if (decodedUrl.includes("v.redd.it")) {
        mediaUrl = `${permalink}/embed`;
      }
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
  logger.info(
    {
      step: "parseToRawArticles",
      subStep: "complete",
      aggregator: aggregatorId,
      feedId,
      articleCount: articles.length,
      elapsed,
    },
    "Reddit posts parsed",
  );

  return articles;
}
