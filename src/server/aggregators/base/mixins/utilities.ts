/**
 * Utility methods mixin for BaseAggregator.
 */

import type { RawArticle } from "../types";

/**
 * Interface for aggregator with utility functionality.
 */
export interface UtilitiesMixin {
  readonly id: string;
}

/**
 * Extract thumbnail URL from an article URL.
 * Can be overridden by subclasses for aggregator-specific logic.
 * @param url The article URL
 * @returns Thumbnail URL or null if not found
 */
export async function extractThumbnailFromUrl(
  this: UtilitiesMixin,
  url: string,
): Promise<string | null> {
  // Default implementation uses generic extraction
  // eslint-disable-next-line sonarjs/deprecation
  const { extractThumbnailUrlFromPage } = await import("../utils");
  // eslint-disable-next-line sonarjs/deprecation
  return await extractThumbnailUrlFromPage(url);
}

/**
 * Collect feed icon URL during aggregation.
 * Can be overridden by subclasses to provide feed-specific icons.
 * The icon URL will be converted to base64 by the aggregation service.
 *
 * @returns Icon URL or null if no icon available
 */
export async function collectFeedIcon(
  this: UtilitiesMixin,
): Promise<string | null> {
  // Default: no feed icon collection
  return null;
}

/**
 * Extract metadata from source data.
 * Override for custom metadata extraction.
 */
export async function extractMetadata(
  this: UtilitiesMixin,
  _sourceData: unknown,
  _article: RawArticle,
): Promise<Partial<Record<string, unknown>>> {
  // Default: no metadata extraction
  return {};
}
