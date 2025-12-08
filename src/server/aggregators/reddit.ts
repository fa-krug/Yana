/**
 * Reddit aggregator.
 *
 * Aggregates posts from Reddit subreddits using Reddit's JSON API.
 * Based on the legacy Python implementation using PRAW.
 */

import { BaseAggregator } from "./base/aggregator";
import type { RawArticle } from "./base/types";
import { logger } from "../utils/logger";
import axios from "axios";
import { getUserSettings } from "../services/userSettings.service";
import { standardizeContentFormat } from "./base/process";

interface RedditPost {
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

interface RedditComment {
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

interface RedditCommentsResponse {
  data: {
    children: RedditComment[];
  };
}

interface RedditSubredditInfo {
  data: {
    display_name: string;
    icon_img: string;
    community_icon: string;
    header_img: string | null;
  };
}

/**
 * Fetch subreddit information including icon.
 */
async function fetchSubredditInfo(
  subreddit: string,
  userAgent: string,
): Promise<{ iconUrl: string | null }> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/about.json`;
    const response = await axios.get<RedditSubredditInfo>(url, {
      headers: {
        "User-Agent": userAgent,
      },
      timeout: 10000,
    });

    const subredditData = response.data.data;
    // Prefer icon_img, fall back to community_icon
    const iconUrl =
      subredditData.icon_img || subredditData.community_icon || null;

    if (iconUrl) {
      logger.debug({ subreddit, iconUrl }, "Fetched subreddit icon");
    }

    return { iconUrl };
  } catch (error) {
    logger.warn({ error, subreddit }, "Failed to fetch subreddit info");
    return { iconUrl: null };
  }
}

/**
 * Extract subreddit name from URL or identifier.
 */
function normalizeSubreddit(identifier: string): string {
  identifier = identifier.trim();

  // Extract from URL
  const urlMatch = identifier.match(/(?:reddit\.com)?\/r\/([a-zA-Z0-9_]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Remove r/ or /r/ prefix
  if (identifier.startsWith("/r/")) {
    return identifier.slice(3);
  }
  if (identifier.startsWith("r/")) {
    return identifier.slice(2);
  }

  return identifier;
}

/**
 * Validate subreddit name.
 */
function validateSubreddit(subreddit: string): {
  valid: boolean;
  error?: string;
} {
  if (!subreddit) {
    return { valid: false, error: "Subreddit is required" };
  }

  // Subreddit names: 2-21 characters, alphanumeric and underscores only
  if (!/^[a-zA-Z0-9_]{2,21}$/.test(subreddit)) {
    return {
      valid: false,
      error:
        "Invalid subreddit name. Use 2-21 alphanumeric characters or underscores.",
    };
  }

  return { valid: true };
}

/**
 * Convert Reddit markdown to HTML.
 * Handles Reddit-specific markdown extensions like ^superscript,
 * ~~strikethrough~~, >!spoilers!<, and Giphy embeds.
 */
function convertRedditMarkdown(text: string): string {
  if (!text) return "";

  // Handle Reddit preview images
  text = text.replace(
    /(?<!\[\(])https?:\/\/preview\.redd\.it\/[^\s\)]+/g,
    (match) => `<img src="${match}" alt="Reddit preview image">`,
  );

  // Convert markdown links with preview.redd.it URLs to image tags
  text = text.replace(
    /\[([^\]]*)\]\((https?:\/\/preview\.redd\.it\/[^\)]+)\)/g,
    (_, alt, url) =>
      `<img src="${url}" alt="${alt || "Reddit preview image"}">`,
  );

  // Handle Giphy images
  text = text.replace(
    /!\[([^\]]*)\]\(giphy\|([a-zA-Z0-9]+)(?:\|[^\)]+)?\)/gi,
    (_, __, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  text = text.replace(
    /<img\s+[^>]*src=\s*["']giphy\|([^"'\|]+)[^"']*["'][^>]*>/gi,
    (_, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  text = text.replace(
    /(?<!["'])giphy\|([a-zA-Z0-9]+)(?!["'])/g,
    (_, giphyId) =>
      `<img src="https://i.giphy.com/${giphyId}.gif" alt="Giphy GIF">`,
  );

  // Handle Reddit-specific superscript syntax
  text = text.replace(/\^(\w+)/g, "<sup>$1</sup>");
  text = text.replace(/\^\(([^)]+)\)/g, "<sup>$1</sup>");

  // Handle strikethrough
  text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Handle spoiler syntax
  text = text.replace(
    />!(.+?)!</g,
    '<span class="spoiler" style="background: #000; color: #000;">$1</span>',
  );

  // Convert newlines to <br>
  text = text.replace(/\n/g, "<br>");

  return text;
}

/**
 * Extract thumbnail URL from Reddit post.
 */
function extractThumbnailUrl(post: RedditPost["data"]): string | null {
  try {
    // Check if submission has a valid thumbnail URL
    if (
      post.thumbnail &&
      !["self", "default", "nsfw", "spoiler"].includes(post.thumbnail)
    ) {
      if (post.thumbnail.startsWith("http")) {
        return post.thumbnail;
      }
      if (post.thumbnail.startsWith("/")) {
        return `https://reddit.com${post.thumbnail}`;
      }
    }

    // Try to get from preview data
    if (post.preview?.images?.[0]?.source?.url) {
      return decodeURIComponent(post.preview.images[0].source.url);
    }

    // For image posts, use the URL directly if it's an image
    if (post.url) {
      const url = post.url.toLowerCase();
      if (
        [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
          url.endsWith(ext),
        )
      ) {
        return post.url;
      }
    }

    // For video posts, try to get preview
    if (post.url?.includes("v.redd.it")) {
      const previewUrl = extractRedditVideoPreview(post);
      if (previewUrl) {
        return previewUrl;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error }, "Could not extract thumbnail URL");
    return null;
  }
}

/**
 * Extract high-quality header image URL from a Reddit post.
 * Prioritizes high-quality images suitable for use as header images.
 */
function extractHeaderImageUrl(post: RedditPost["data"]): string | null {
  try {
    // Priority 1: Preview source images (highest quality)
    if (post.preview?.images?.[0]?.source?.url) {
      const headerUrl = decodeURIComponent(post.preview.images[0].source.url);
      logger.debug({ url: headerUrl }, "Extracted header image from preview");
      return headerUrl;
    }

    // Priority 2: Gallery posts - get first high-quality image
    if (
      post.is_gallery &&
      post.media_metadata &&
      post.gallery_data?.items?.[0]
    ) {
      const mediaId = post.gallery_data.items[0].media_id;
      const mediaInfo = post.media_metadata[mediaId];

      if (mediaInfo) {
        // For animated images, prefer GIF or MP4
        if (mediaInfo.e === "AnimatedImage") {
          if (mediaInfo.s?.gif) {
            const gifUrl = decodeURIComponent(mediaInfo.s.gif);
            logger.debug(
              { url: gifUrl },
              "Extracted header image from gallery GIF",
            );
            return gifUrl;
          } else if (mediaInfo.s?.mp4) {
            const mp4Url = decodeURIComponent(mediaInfo.s.mp4);
            logger.debug(
              { url: mp4Url },
              "Extracted header image from gallery MP4",
            );
            return mp4Url;
          }
        }
        // For regular images, get the high-quality URL
        else if (mediaInfo.e === "Image" && mediaInfo.s?.u) {
          const imageUrl = decodeURIComponent(mediaInfo.s.u);
          logger.debug(
            { url: imageUrl },
            "Extracted header image from gallery",
          );
          return imageUrl;
        }
      }
    }

    // Priority 3: Direct image posts - use URL directly
    if (post.url) {
      const url = post.url.toLowerCase();
      if (
        [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((ext) =>
          url.endsWith(ext),
        )
      ) {
        logger.debug({ url: post.url }, "Using direct image URL as header");
        return post.url;
      }
    }

    // Priority 4: Video posts - use preview
    if (post.url?.includes("v.redd.it")) {
      const previewUrl = extractRedditVideoPreview(post);
      if (previewUrl) {
        logger.debug({ url: previewUrl }, "Using video preview as header");
        return previewUrl;
      }
    }

    // Priority 5: Fall back to thumbnail extraction
    const thumbnailUrl = extractThumbnailUrl(post);
    if (thumbnailUrl) {
      logger.debug(
        { url: thumbnailUrl },
        "Falling back to thumbnail as header",
      );
      return thumbnailUrl;
    }

    return null;
  } catch (error) {
    logger.debug({ error }, "Could not extract header image URL");
    return null;
  }
}

/**
 * Extract preview/thumbnail image URL from a Reddit video post.
 */
function extractRedditVideoPreview(post: RedditPost["data"]): string | null {
  try {
    if (!post.preview?.images?.[0]?.source?.url) {
      return null;
    }

    const previewUrl = decodeURIComponent(post.preview.images[0].source.url);
    logger.debug({ url: previewUrl }, "Extracted Reddit video preview");
    return previewUrl;
  } catch (error) {
    logger.debug({ error }, "Could not extract Reddit video preview");
    return null;
  }
}

/**
 * Extract animated GIF URL from Reddit preview data.
 */
function extractAnimatedGifUrl(post: RedditPost["data"]): string | null {
  try {
    if (!post.preview?.images?.[0]) {
      return null;
    }

    const imageData = post.preview.images[0];

    if (imageData.variants?.gif?.source?.url) {
      const gifUrl = decodeURIComponent(imageData.variants.gif.source.url);
      logger.debug({ url: gifUrl }, "Extracted animated GIF URL");
      return gifUrl;
    }

    if (imageData.variants?.mp4?.source?.url) {
      const mp4Url = decodeURIComponent(imageData.variants.mp4.source.url);
      logger.debug({ url: mp4Url }, "Extracted animated MP4 URL");
      return mp4Url;
    }

    return null;
  } catch (error) {
    logger.debug({ error }, "Could not extract animated GIF URL");
    return null;
  }
}

/**
 * Extract URLs from Reddit post text (selftext).
 * Handles both plain URLs and markdown links [text](url).
 */
function extractUrlsFromText(text: string): string[] {
  if (!text) return [];

  const urls: string[] = [];

  // Pattern for markdown links: [text](url)
  const markdownLinkPattern = /\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
  let match;
  while ((match = markdownLinkPattern.exec(text)) !== null) {
    urls.push(match[2]);
  }

  // Pattern for plain URLs: http:// or https://
  // This regex matches URLs but avoids matching URLs already found in markdown links
  const plainUrlPattern = /(?<!\]\()(https?:\/\/[^\s\)]+)/g;
  while ((match = plainUrlPattern.exec(text)) !== null) {
    // Remove trailing punctuation that might be part of the sentence
    const url = match[1].replace(/[.,;:!?)]+$/, "");
    if (!urls.includes(url)) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Format a single comment as HTML with link.
 */
function formatCommentHtml(comment: RedditComment["data"]): string {
  const author = comment.author || "[deleted]";
  const body = convertRedditMarkdown(comment.body || "");
  const commentUrl = `https://reddit.com${comment.permalink}`;

  return `
<blockquote>
<p><strong>${escapeHtml(author)}</strong> | <a href="${commentUrl}">source</a></p>
<div>${body}</div>
</blockquote>
`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Fetch comments for a Reddit post.
 */
async function fetchPostComments(
  subreddit: string,
  postId: string,
  commentLimit: number,
  userAgent: string,
): Promise<RedditComment["data"][]> {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;
    const response = await axios.get(url, {
      headers: {
        "User-Agent": userAgent,
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

    // Flatten comment tree and sort by score
    const allComments: RedditComment["data"][] = [];
    const flattenComments = (comments: RedditComment[]) => {
      for (const comment of comments) {
        if (
          comment.data.body &&
          comment.data.body !== "[deleted]" &&
          comment.data.body !== "[removed]"
        ) {
          allComments.push(comment.data);
        }
        if (comment.data.replies?.data?.children) {
          flattenComments(comment.data.replies.data.children);
        }
      }
    };

    flattenComments(commentsData.data.children);

    // Sort by score (descending) and filter out bots
    const filtered = allComments
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
    logger.warn({ error, subreddit, postId }, "Error fetching Reddit comments");
    return [];
  }
}

/**
 * Build post content with comments.
 */
async function buildPostContent(
  post: RedditPost["data"],
  commentLimit: number,
  subreddit: string,
  userAgent: string,
): Promise<string> {
  const contentParts: string[] = [];

  // Post content (selftext or link)
  if (post.is_self && post.selftext) {
    // Text post - convert Reddit markdown to HTML
    const selftextHtml = convertRedditMarkdown(post.selftext);
    contentParts.push(`<div>${selftextHtml}</div>`);
  } else if (
    post.is_gallery &&
    post.media_metadata &&
    post.gallery_data?.items
  ) {
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
            if (caption) {
              contentParts.push(
                `<figure><img src="${decoded}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`,
              );
            } else {
              contentParts.push(
                `<p><img src="${decoded}" alt="Animated GIF"></p>`,
              );
            }
          }
        } else if (mediaInfo.e === "Image" && mediaInfo.s?.u) {
          const imageUrl = decodeURIComponent(mediaInfo.s.u);
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
    const url = post.url;

    if (
      url.toLowerCase().endsWith(".gif") ||
      url.toLowerCase().endsWith(".gifv")
    ) {
      const gifUrl = extractAnimatedGifUrl(post);
      if (gifUrl) {
        contentParts.push(`<p><img src="${gifUrl}" alt="Animated GIF"></p>`);
      } else {
        const finalUrl = url.toLowerCase().endsWith(".gifv")
          ? url.slice(0, -1)
          : url;
        contentParts.push(`<p><img src="${finalUrl}" alt="Animated GIF"></p>`);
      }
    } else if (
      [".jpg", ".jpeg", ".png", ".webp"].some((ext) =>
        url.toLowerCase().endsWith(ext),
      )
    ) {
      contentParts.push(`<p><img src="${url}" alt="Post image"></p>`);
    } else if (url.includes("v.redd.it")) {
      const previewUrl = extractRedditVideoPreview(post);
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
      contentParts.push(`<p><a href="${url}">${escapeHtml(url)}</a></p>`);
    }
  }

  // Comments section
  const permalink = `https://reddit.com${post.permalink}`;
  contentParts.push(
    `<h3><a href="${permalink}" target="_blank" rel="noopener">Comments</a></h3>`,
  );

  // Fetch and format comments
  if (commentLimit > 0) {
    const comments = await fetchPostComments(
      subreddit,
      post.id,
      commentLimit,
      userAgent,
    );
    if (comments.length > 0) {
      const commentHtmls = comments.map(formatCommentHtml);
      contentParts.push(commentHtmls.join(""));
    } else {
      contentParts.push("<p><em>No comments yet.</em></p>");
    }
  } else {
    contentParts.push("<p><em>Comments disabled.</em></p>");
  }

  return contentParts.join("");
}

export class RedditAggregator extends BaseAggregator {
  override readonly id = "reddit";
  override readonly type = "social" as const;
  override readonly name = "Reddit";
  override readonly url = "https://www.reddit.com/r/example";
  override readonly description =
    "Reddit - Social news aggregation and discussion website organized into communities (subreddits).";

  override readonly identifierType = "string" as const;
  override readonly identifierLabel = "Subreddit";
  override readonly identifierDescription =
    "Enter the subreddit name (e.g., 'python', 'programming'). You can also use 'r/python' or a full Reddit URL.";
  override readonly identifierPlaceholder = "python";
  override readonly identifierEditable = true;

  override readonly options = {
    sort_by: {
      type: "choice" as const,
      label: "Sort Method",
      helpText: "How to sort posts: hot (default), new, top, or rising",
      default: "hot",
      required: false,
      choices: [
        ["hot", "Hot"],
        ["new", "New"],
        ["top", "Top"],
        ["rising", "Rising"],
      ] as Array<[string, string]>,
    },
    comment_limit: {
      type: "integer" as const,
      label: "Comment Limit",
      helpText: "Number of top comments to fetch per post",
      default: 10,
      required: false,
      min: 0,
      max: 50,
    },
  };

  /**
   * Validate subreddit identifier.
   */
  async validateIdentifier(
    identifier: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const subreddit = normalizeSubreddit(identifier);
    return validateSubreddit(subreddit);
  }

  /**
   * Normalize subreddit identifier.
   */
  normalizeIdentifier(identifier: string): string {
    return normalizeSubreddit(identifier);
  }

  /**
   * Get Reddit user agent from user settings or use default.
   */
  private async getUserAgent(): Promise<string> {
    if (!this.feed?.userId) {
      return "Yana/1.0";
    }

    try {
      const settings = await getUserSettings(this.feed.userId);
      return settings.redditUserAgent || "Yana/1.0";
    } catch (error) {
      logger.warn(
        { error },
        "Could not get user settings, using default user agent",
      );
      return "Yana/1.0";
    }
  }

  async aggregate(articleLimit?: number): Promise<RawArticle[]> {
    if (!this.feed) {
      throw new Error("Feed not initialized");
    }

    const subreddit = normalizeSubreddit(this.feed.identifier);
    if (!subreddit) {
      throw new Error(
        `Could not extract subreddit from identifier: ${this.feed.identifier}`,
      );
    }

    logger.info(
      { subreddit, feedId: this.feed.id },
      "Starting Reddit aggregation",
    );

    const sortBy = this.getOption("sort_by", "hot") as string;
    const commentLimit = this.getOption("comment_limit", 10) as number;
    const userAgent = await this.getUserAgent();

    // Fetch subreddit info to get icon for feed thumbnail
    const subredditInfo = await fetchSubredditInfo(subreddit, userAgent);

    // Store subreddit icon URL for later use in aggregation service
    // We'll access it via a property on the aggregator instance
    (this as any).__subredditIconUrl = subredditInfo.iconUrl;

    // Calculate desired article count
    const desiredArticleCount = articleLimit || 25;

    // Fetch 2-3x more posts than needed to account for filtering
    // (AutoModerator posts, old posts, etc.)
    // Reddit API max is 100
    const fetchLimit = Math.min(desiredArticleCount * 3, 100);

    try {
      // Fetch posts from Reddit JSON API
      const url = `https://www.reddit.com/r/${subreddit}/${sortBy}.json`;
      const response = await axios.get(url, {
        params: {
          limit: fetchLimit,
        },
        headers: {
          "User-Agent": userAgent,
        },
        timeout: 30000,
      });

      const posts: RedditPost[] = response.data.data.children || [];

      if (posts.length === 0) {
        logger.warn({ subreddit }, "No posts found in subreddit");
        return [];
      }

      logger.info(
        { subreddit, postCount: posts.length, desiredArticleCount },
        "Successfully fetched Reddit posts",
      );

      // Convert to RawArticle format
      const articles: RawArticle[] = [];
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      // Get feed thumbnail (subreddit icon) for fallback
      const feedThumbnailUrl = subredditInfo.iconUrl;

      for (const post of posts) {
        // Stop if we have enough articles
        if (articles.length >= desiredArticleCount) {
          break;
        }

        const postData = post.data;

        // Skip AutoModerator posts
        if (postData.author === "AutoModerator") {
          logger.debug({ postId: postData.id }, "Skipping AutoModerator post");
          continue;
        }

        // Skip if too old (older than 2 months)
        const postDate = new Date(postData.created_utc * 1000);
        if (postDate < twoMonthsAgo) {
          logger.debug(
            { postId: postData.id, date: postDate },
            "Skipping old post",
          );
          continue;
        }

        const permalink = `https://reddit.com${postData.permalink}`;
        const rawContent = await buildPostContent(
          postData,
          commentLimit,
          subreddit,
          userAgent,
        );
        const headerImageUrl = extractHeaderImageUrl(postData);
        const thumbnailUrl = extractThumbnailUrl(postData);

        // Standardize content format (convert header image to base64, add source footer)
        const generateTitleImage = this.feed?.generateTitleImage ?? true;
        const addSourceFooter = this.feed?.addSourceFooter ?? true;
        const content = await standardizeContentFormat(
          rawContent,
          {
            title: postData.title,
            url: permalink,
            published: postDate,
            content: rawContent,
            summary: postData.selftext || "",
            author: postData.author,
            score: postData.score,
            externalId: postData.id,
          },
          permalink,
          generateTitleImage,
          addSourceFooter,
          headerImageUrl ?? undefined,
        );

        // For article thumbnail: use header image if available, otherwise use thumbnail
        const articleThumbnailUrl = headerImageUrl || thumbnailUrl || undefined;

        // Set media_url for Reddit videos
        let mediaUrl: string | undefined;
        if (postData.is_video && postData.url?.includes("v.redd.it")) {
          mediaUrl = `${permalink}/embed`;
        }

        articles.push({
          title: postData.title,
          url: permalink,
          published: postDate,
          content,
          summary: postData.selftext || "",
          author: postData.author,
          score: postData.score,
          thumbnailUrl: articleThumbnailUrl,
          mediaUrl,
          externalId: postData.id,
        });
      }

      logger.info(
        { subreddit, articleCount: articles.length },
        "Completed Reddit aggregation",
      );
      return articles;
    } catch (error) {
      logger.error(
        { error, subreddit, feedId: this.feed.id },
        "Error fetching Reddit posts",
      );
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(
            `Subreddit 'r/${subreddit}' does not exist or is private.`,
          );
        }
        if (error.response?.status === 403) {
          throw new Error(`Subreddit 'r/${subreddit}' is private or banned.`);
        }
      }
      throw error;
    }
  }
}
