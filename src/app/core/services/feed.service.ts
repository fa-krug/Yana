/**
 * Feed service - manages feed CRUD operations and state.
 * Now uses tRPC for type-safe API calls.
 */

import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { tap, catchError, map } from "rxjs";
import {
  Feed,
  FeedCreateRequest,
  FeedPreviewRequest,
  FeedPreviewResponse,
  PaginatedResponse,
} from "../models";
import { TRPCService } from "../trpc/trpc.service";
import { CacheService } from "./cache.service";

export interface FeedFilters {
  search?: string;
  feedType?: "article" | "youtube" | "podcast" | "reddit";
  enabled?: boolean;
  groupId?: number;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: "root" })
export class FeedService {
  private trpc = inject(TRPCService);
  private cacheService = inject(CacheService);

  private feedsSignal = signal<Feed[]>([]);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);
  private totalCountSignal = signal<number>(0);
  private currentPageSignal = signal<number>(1);
  private pageSizeSignal = signal<number>(20);

  readonly feeds = this.feedsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly totalCount = this.totalCountSignal.asReadonly();
  readonly currentPage = this.currentPageSignal.asReadonly();
  readonly pageSize = this.pageSizeSignal.asReadonly();
  readonly totalPages = computed(() =>
    Math.ceil(this.totalCountSignal() / this.pageSizeSignal()),
  );

  /**
   * Load feeds with optional filters
   * @param filters - Filter options
   * @param silent - If true, don't show loading state (for background updates)
   */
  loadFeeds(
    filters: FeedFilters = {},
    silent: boolean = false,
  ): Observable<PaginatedResponse<Feed>> {
    if (!silent) {
      this.loadingSignal.set(true);
    }
    this.errorSignal.set(null);

    // Generate cache key from filters
    const cacheKey = this.getCacheKey(filters);

    return this.cacheService
      .getOrSet<PaginatedResponse<Feed>>(
        cacheKey,
        () =>
          from(
            this.trpc.client.feed.list.query({
              page: filters.page || 1,
              pageSize: filters.pageSize || 20,
              search: filters.search,
              feedType: filters.feedType,
              enabled: filters.enabled,
              groupId: filters.groupId,
            }),
          ),
        // Cache feeds for 3 minutes (feeds change less frequently)
        3 * 60 * 1000,
      )
      .pipe(
        map((response: PaginatedResponse<Feed>) => ({
          items: response.items || [],
          count: response.count || 0,
          page: response.page || 1,
          pageSize: response.pageSize || 20,
          pages: response.pages || 0,
        })),
        tap((response) => {
          this.feedsSignal.set(response.items || []);
          this.totalCountSignal.set(response.count || 0);
          this.currentPageSignal.set(response.page || 1);
          this.pageSizeSignal.set(response.pageSize || 20);
          if (!silent) {
            this.loadingSignal.set(false);
          }
        }),
        catchError((error) => {
          console.error("Error loading feeds:", error);
          this.errorSignal.set(error.message || "Failed to load feeds");
          if (!silent) {
            this.loadingSignal.set(false);
          }
          return of({ items: [], count: 0, page: 1, pageSize: 20, pages: 0 });
        }),
      );
  }

  /**
   * Get a single feed by ID
   */
  getFeed(id: number): Observable<Feed> {
    const cacheKey = `feed:${id}`;
    return this.cacheService.getOrSet<Feed>(
      cacheKey,
      () => from(this.trpc.client.feed.getById.query({ id })),
      // Cache feed details for 5 minutes
      5 * 60 * 1000,
    );
  }

  /**
   * Generate cache key from filters
   */
  private getCacheKey(filters: FeedFilters): string {
    const parts = [
      "feeds",
      `page:${filters.page || 1}`,
      `pageSize:${filters.pageSize || 20}`,
      filters.search ? `search:${filters.search}` : "",
      filters.feedType ? `feedType:${filters.feedType}` : "",
      filters.enabled !== undefined ? `enabled:${filters.enabled}` : "",
      filters.groupId ? `groupId:${filters.groupId}` : "",
    ];
    return parts.filter((p) => p).join("|");
  }

  /**
   * Invalidate feed cache
   */
  invalidateFeedCache(): void {
    this.cacheService.invalidatePattern(/^feeds\|/);
  }

  /**
   * Create a new feed
   */
  createFeed(feed: FeedCreateRequest): Observable<Feed> {
    return from(this.trpc.client.feed.create.mutate(feed)).pipe(
      tap(() => {
        // Refresh feeds list after creation
        this.loadFeeds({ page: this.currentPageSignal() }).subscribe();
      }),
    );
  }

  /**
   * Preview a feed configuration (test without saving)
   */
  previewFeed(feed: FeedPreviewRequest): Observable<FeedPreviewResponse> {
    return from(this.trpc.client.feed.preview.mutate(feed));
  }

  /**
   * Update an existing feed
   */
  updateFeed(id: number, feed: Partial<FeedCreateRequest>): Observable<Feed> {
    return from(
      this.trpc.client.feed.update.mutate({
        id,
        data: feed,
      }),
    ).pipe(
      tap((updatedFeed) => {
        // Update feed in local state
        const feeds = this.feedsSignal();
        const index = feeds.findIndex((f) => f.id === id);
        if (index !== -1) {
          const newFeeds = [...feeds];
          newFeeds[index] = updatedFeed;
          this.feedsSignal.set(newFeeds);
        }
      }),
    );
  }

  /**
   * Delete a feed
   */
  deleteFeed(id: number): Observable<void> {
    return from(this.trpc.client.feed.delete.mutate({ id })).pipe(
      tap(() => {
        // Remove feed from local state
        const feeds = this.feedsSignal();
        this.feedsSignal.set(feeds.filter((f) => f.id !== id));
        this.totalCountSignal.set(this.totalCountSignal() - 1);
      }),
      map(() => undefined),
    );
  }

  /**
   * Reload/aggregate a feed
   */
  reloadFeed(
    id: number,
    forceRefresh: boolean = false,
  ): Observable<{
    message: string;
    articlesAdded: number;
    articlesUpdated: number;
    articlesSkipped: number;
    success: boolean;
    errors: string[];
  }> {
    return from(
      this.trpc.client.feed.reload.mutate({
        id,
        force: forceRefresh,
      }),
    ).pipe(
      map((response) => ({
        message: response.message || "",
        articlesAdded: response.articlesAdded || 0,
        articlesUpdated: response.articlesUpdated || 0,
        articlesSkipped: response.articlesSkipped || 0,
        success: response.success || false,
        errors: response.errors || [],
      })),
    );
  }

  /**
   * Clear all articles from a feed
   */
  clearFeedArticles(
    id: number,
  ): Observable<{ message: string; articleCount: number }> {
    return from(this.trpc.client.feed.clear.mutate({ id })).pipe(
      map((response) => ({
        message: response.message || "",
        articleCount: 0, // tRPC response doesn't include article count
      })),
    );
  }

  /**
   * Refresh current feeds list
   */
  refresh(): void {
    this.loadFeeds({ page: this.currentPageSignal() }).subscribe();
  }
}
