/**
 * LRU cache with TTL for aggregator content.
 */

interface CacheEntry {
  content: string;
  timestamp: number;
}

class LRUCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number;
  private readonly ttl: number; // in seconds

  constructor(maxSize: number = 1000, ttl: number = 3600) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Get content from cache if it exists and hasn't expired.
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = (now - entry.timestamp) / 1000; // age in seconds

    if (age > this.ttl) {
      // Expired, remove it
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.content;
  }

  /**
   * Set content in cache with TTL and enforce max size.
   */
  set(key: string, content: string): void {
    // Remove oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size.
   */
  size(): number {
    return this.cache.size;
  }
}

// Per-aggregator cache instances
const aggregatorCaches = new Map<string, LRUCache>();

/**
 * Get or create cache for an aggregator.
 */
export function getCache(
  aggregatorId: string,
  maxSize: number = 1000,
  ttl: number = 3600,
): LRUCache {
  if (!aggregatorCaches.has(aggregatorId)) {
    aggregatorCaches.set(aggregatorId, new LRUCache(maxSize, ttl));
  }
  const cache = aggregatorCaches.get(aggregatorId);
  if (!cache) {
    throw new Error(`Cache not found for aggregator: ${aggregatorId}`);
  }
  return cache;
}

/**
 * Clear all aggregator caches.
 */
export function clearAllCaches(): void {
  for (const cache of aggregatorCaches.values()) {
    cache.clear();
  }
  aggregatorCaches.clear();
}

/**
 * Generate cache key from URL and aggregator ID.
 */
export function generateCacheKey(aggregatorId: string, url: string): string {
  return `${aggregatorId}:${url}`;
}
