/**
 * Article reload helper functions.
 *
 * Extracted functions for processing article reload to reduce complexity.
 */

import type { BaseAggregator } from "../aggregators/base/aggregator";
import type { RawArticle } from "../aggregators/base/types";
import type { Article, Feed } from "../db/types";

/**
 * Build RawArticle from database article with optional header image preservation.
 */
export function buildRawArticleFromDatabase(
  article: Article,
  headerImageUrl?: string,
): RawArticle {
  const base: RawArticle = {
    title: article.name,
    url: article.url,
    published: article.date,
    author: article.author || undefined,
    externalId: article.externalId || undefined,
    score: article.score || undefined,
    thumbnailUrl: article.thumbnailUrl || undefined,
    mediaUrl: article.mediaUrl || undefined,
    duration: article.duration || undefined,
    viewCount: article.viewCount || undefined,
    mediaType: article.mediaType || undefined,
  };

  return headerImageUrl ? { ...base, headerImageUrl } : base;
}

/**
 * Determine article date based on feed setting.
 */
export function determineArticleDate(
  feed: Feed,
  rawArticle: RawArticle,
  originalDate: Date,
): Date {
  if (feed.useCurrentTimestamp) {
    return new Date();
  }
  return rawArticle.published ?? originalDate;
}

/**
 * Convert thumbnail URL to base64 if needed.
 */
export async function convertThumbnailToBase64(
  thumbnailUrl?: string,
): Promise<string | null> {
  if (!thumbnailUrl) {
    return null;
  }

  // Already base64 encoded
  if (thumbnailUrl.startsWith("data:")) {
    return thumbnailUrl;
  }

  // Convert URL to base64
  const { convertThumbnailUrlToBase64 } =
    await import("@server/aggregators/base/utils");
  return await convertThumbnailUrlToBase64(thumbnailUrl);
}

/**
 * Extract thumbnail from aggregator or content as fallback.
 */
export async function extractThumbnailWithFallback(
  article: Article,
  aggregator: BaseAggregator,
  processedContent: string,
): Promise<string | null> {
  // Try aggregator's extraction method
  try {
    const thumbnailUrl = await aggregator.extractThumbnailFromUrl(article.url);
    if (thumbnailUrl) {
      const base64 = await convertThumbnailToBase64(thumbnailUrl);
      if (base64) {
        return base64;
      }
    }
  } catch {
    // Continue to next fallback
  }

  // Fallback: Extract from content
  try {
    const { extractBase64ImageFromContent } =
      await import("@server/aggregators/base/utils");
    const base64 = extractBase64ImageFromContent(processedContent);
    if (base64) {
      return base64;
    }
  } catch {
    // Continue
  }

  return null;
}

/**
 * Handle thumbnail base64 conversion and extraction with fallbacks.
 */
export async function processThumbnailBase64(
  rawArticle: RawArticle,
  article: Article,
  aggregator: BaseAggregator,
  processedContent: string,
): Promise<string | null> {
  // Try direct URL to base64 conversion
  if (rawArticle.thumbnailUrl) {
    const base64 = await convertThumbnailToBase64(rawArticle.thumbnailUrl);
    if (base64) {
      return base64;
    }
  }

  // Try aggregator extraction with fallback to content
  return await extractThumbnailWithFallback(
    article,
    aggregator,
    processedContent,
  );
}
