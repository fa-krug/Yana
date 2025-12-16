/**
 * Generic cache service for storing API responses with TTL.
 * Uses in-memory cache with optional IndexedDB persistence.
 */

import { Injectable } from "@angular/core";
import { Observable, of, from } from "rxjs";
import { map, catchError } from "rxjs/operators";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

@Injectable({
  providedIn: "root",
})
export class CacheService {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached data or execute the observable and cache the result
   */
  getOrSet<T>(
    key: string,
    observable: () => Observable<T>,
    ttl: number = this.defaultTTL,
  ): Observable<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return of(cached);
    }

    return observable().pipe(
      map((data) => {
        this.set(key, data, ttl);
        return data;
      }),
    );
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    this.memoryCache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.memoryCache.delete(key));
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.memoryCache.size;
  }
}
