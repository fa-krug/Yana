/**
 * Caching mixin for BaseAggregator.
 */

import type { RawArticle } from "../types";

/**
 * Interface for aggregator with caching functionality.
 */
export interface CachingMixin {
  readonly id: string;
  readonly forceRefresh: boolean;
  readonly cacheMaxSize: number;
  readonly cacheTTL: number;
}

/**
 * Get cached content for article.
 * Override for custom caching strategy.
 */
export async function getCachedContent(
  this: CachingMixin,
  article: RawArticle,
): Promise<string | null> {
  if (this.forceRefresh) {
    return null;
  }

  const { getCache, generateCacheKey } = await import("../cache");
  const cache = getCache(this.id, this.cacheMaxSize, this.cacheTTL);
  const key = generateCacheKey(this.id, article.url);
  return cache.get(key);
}

/**
 * Set cached content for article.
 * Override for custom caching strategy.
 */
export async function setCachedContent(
  this: CachingMixin,
  article: RawArticle,
  content: string,
): Promise<void> {
  const { getCache, generateCacheKey } = await import("../cache");
  const cache = getCache(this.id, this.cacheMaxSize, this.cacheTTL);
  const key = generateCacheKey(this.id, article.url);
  cache.set(key, content);
}
