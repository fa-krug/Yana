/**
 * Reddit post parsing utilities.
 */

import type { RawArticle } from "../base/types";
import { logger } from "@server/utils/logger";
import { buildPostContent } from "./content";
import { extractHeaderImageUrl, extractThumbnailUrl } from "./images";
import { decodeHtmlEntitiesInUrl } from "./urls";
import type { RedditPost, RedditPostData } from "./types";

/**
 * Extract original post data from cross-post if present.
 * Returns the original post data if this is a cross-post, otherwise returns the post data as-is.
 */
function getOriginalPostData(postData: RedditPostData): RedditPostData {
  // Check if this is a cross-post and has original post data
  if (
    postData.crosspost_parent_list &&
    postData.crosspost_parent_list.length > 0
  ) {
    const originalPost = postData.crosspost_parent_list[0];
    logger.debug(
      {
        crosspostId: postData.id,
        originalPostId: originalPost.id,
        originalSubreddit: originalPost.subreddit,
      },
      "Detected cross-post, using original post data",
    );
    // Return the original post data, preserving the structure
    return {
      ...originalPost,
      // Ensure all required fields are present
      id: originalPost.id,
      title: originalPost.title,
      selftext: originalPost.selftext || "",
      selftext_html: originalPost.selftext_html || null,
      url: originalPost.url,
      permalink: originalPost.permalink,
      created_utc: originalPost.created_utc,
      author: originalPost.author,
      score: originalPost.score,
      num_comments: originalPost.num_comments,
      thumbnail: originalPost.thumbnail,
      preview: originalPost.preview,
      media_metadata: originalPost.media_metadata,
      gallery_data: originalPost.gallery_data,
      is_gallery: originalPost.is_gallery,
      is_self: originalPost.is_self,
      is_video: originalPost.is_video,
      media: originalPost.media,
    };
  }
  // Not a cross-post, return data as-is
  return postData;
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

  const articles: RawArticle[] = [];

  for (const post of posts) {
    // Get original post data if this is a cross-post
    const postData = getOriginalPostData(post.data);

    // Get the original subreddit from the post data (for cross-posts, use original subreddit)
    const originalSubreddit =
      post.data.crosspost_parent_list?.[0]?.subreddit || subreddit;

    const postDate = new Date(postData.created_utc * 1000);
    const decodedPermalink = decodeHtmlEntitiesInUrl(postData.permalink);
    const permalink = `https://reddit.com${decodedPermalink}`;

    const rawContent = await buildPostContent(
      postData,
      commentLimit,
      originalSubreddit,
      userId,
    );
    const headerImageUrl = await extractHeaderImageUrl(postData);
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
