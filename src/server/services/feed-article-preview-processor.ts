/**
 * Feed article preview processing.
 *
 * Converts raw aggregated articles into preview format with thumbnails.
 * Handles thumbnail extraction and base64 conversion with fallback.
 */

import type { BaseAggregator } from "../aggregators/base/aggregator";
import type { RawArticle } from "../aggregators/base/types";
import type { Feed } from "../db/types";
import { logger } from "../utils/logger";

export interface PreviewArticle {
  title: string;
  content: string;
  published?: string;
  author?: string;
  thumbnailUrl?: string;
  link: string;
  mediaUrl?: string;
  feedType?: "article" | "youtube" | "podcast" | "reddit";
}

/**
 * Process raw articles into preview format.
 * Extracts thumbnails and converts to base64 for display.
 */
export async function processArticlesForPreview(
  rawArticles: RawArticle[],
  aggregator: BaseAggregator,
  feed: Feed,
): Promise<PreviewArticle[]> {
  const previewArticles: PreviewArticle[] = [];

  for (const article of rawArticles) {
    try {
      const previewArticle = await processArticle(article, aggregator, feed);
      previewArticles.push(previewArticle);
    } catch (error) {
      logger.warn({ error, article }, "Error processing article for preview");
      // Continue to next article on error
    }
  }

  return previewArticles;
}

/**
 * Process a single article into preview format.
 */
async function processArticle(
  article: RawArticle,
  aggregator: BaseAggregator,
  feed: Feed,
): Promise<PreviewArticle> {
  const thumbnailUrl = await getThumbnailForArticle(article, aggregator);

  return {
    title: article.title,
    content: article.content || article.summary || "",
    published: article.published ? article.published.toISOString() : undefined,
    author: article.author,
    thumbnailUrl,
    link: article.url,
    mediaUrl: article.mediaUrl,
    feedType: feed.feedType,
  };
}

/**
 * Get thumbnail for article, trying article's URL first, then aggregator extraction.
 */
async function getThumbnailForArticle(
  article: RawArticle,
  aggregator: BaseAggregator,
): Promise<string | undefined> {
  // Try article's thumbnail URL first
  if (article.thumbnailUrl) {
    try {
      const thumbnailBase64 = await convertThumbnailUrlToBase64(
        article.thumbnailUrl,
      );
      if (thumbnailBase64) {
        return thumbnailBase64;
      }
    } catch (error) {
      logger.warn({ error, url: article.thumbnailUrl }, "Failed to convert thumbnail URL");
    }
  }

  // Try extracting thumbnail from article URL
  try {
    const thumbnailUrl = await aggregator.extractThumbnailFromUrl(article.url);
    if (thumbnailUrl) {
      const thumbnailBase64 = await convertThumbnailUrlToBase64(thumbnailUrl);
      if (thumbnailBase64) {
        return thumbnailBase64;
      }
    }
  } catch (error) {
    logger.warn({ error, url: article.url }, "Failed to extract thumbnail from URL");
  }

  return undefined;
}

/**
 * Convert thumbnail URL to base64 string.
 */
async function convertThumbnailUrlToBase64(
  url: string,
): Promise<string | null> {
  const { convertThumbnailUrlToBase64 } = await import(
    "../aggregators/base/utils"
  );
  return await convertThumbnailUrlToBase64(url);
}
