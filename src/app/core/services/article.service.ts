/**
 * Article service - manages article operations and state.
 * Now uses tRPC for type-safe API calls.
 */

import { Injectable, inject, signal, computed } from "@angular/core";
import {
  Observable,
  from,
  of,
  expand,
  EMPTY,
  reduce,
  switchMap,
  mergeMap,
  concatMap,
  timer,
  filter,
  take,
} from "rxjs";
import { tap, catchError, map, retry } from "rxjs";
import { Article, ArticleDetail, PaginatedResponse } from "../models";
import { TRPCService } from "../trpc/trpc.service";

export interface ArticleFilters {
  feedId?: number;
  groupId?: number;
  read?: boolean;
  saved?: boolean;
  readState?: "read" | "unread" | null;
  search?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: "root" })
export class ArticleService {
  private trpc = inject(TRPCService);

  private articlesSignal = signal<Article[]>([]);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);
  private totalCountSignal = signal<number>(0);
  private currentPageSignal = signal<number>(1);
  private pageSizeSignal = signal<number>(20);
  private currentFeedIdSignal = signal<number | undefined>(undefined);

  readonly articles = this.articlesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly totalCount = this.totalCountSignal.asReadonly();
  readonly currentPage = this.currentPageSignal.asReadonly();
  readonly pageSize = this.pageSizeSignal.asReadonly();
  readonly totalPages = computed(() =>
    Math.ceil(this.totalCountSignal() / this.pageSizeSignal()),
  );

  /**
   * Load articles with optional filters
   * @param filters - Filter options
   * @param silent - If true, don't show loading state (for background updates)
   */
  loadArticles(
    filters: ArticleFilters = {},
    silent: boolean = false,
  ): Observable<PaginatedResponse<Article>> {
    // Clear articles immediately if feedId changes to prevent showing stale data
    const previousFeedId = this.currentFeedIdSignal();
    const newFeedId = filters.feedId;
    if (previousFeedId !== newFeedId) {
      this.articlesSignal.set([]);
      this.totalCountSignal.set(0);
    }
    this.currentFeedIdSignal.set(newFeedId);

    if (!silent) {
      this.loadingSignal.set(true);
    }
    this.errorSignal.set(null);

    // Convert readState to isRead boolean if readState is provided
    let isRead: boolean | undefined = filters.read;
    if (
      isRead === undefined &&
      filters.readState !== undefined &&
      filters.readState !== null
    ) {
      isRead = filters.readState === "read";
    }

    return from(
      this.trpc.client.article.list.query({
        page: filters.page || 1,
        pageSize: filters.pageSize || 20,
        feedId: filters.feedId,
        groupId: filters.groupId,
        isRead: isRead,
        isSaved: filters.saved,
        search: filters.search,
        dateFrom: filters.dateFrom
          ? filters.dateFrom instanceof Date
            ? filters.dateFrom.toISOString()
            : filters.dateFrom
          : undefined,
        dateTo: filters.dateTo
          ? filters.dateTo instanceof Date
            ? filters.dateTo.toISOString()
            : filters.dateTo
          : undefined,
      }),
    ).pipe(
      map((response) => ({
        items: (response.items || []).map((article) => {
          let summary = article.content
            ? article.content.substring(0, 200)
            : undefined;
          // Remove base64 images from summary
          if (summary) {
            summary = summary.replace(
              /<img[^>]*src\s*=\s*["']data:image\/[^"']*["'][^>]*>/gi,
              "",
            );
            summary = summary.replace(/<img[^>]*>/gi, "");
          }
          return {
            ...article,
            thumbnailUrl: article.thumbnailUrl ?? undefined,
            mediaUrl: article.mediaUrl ?? undefined,
            duration: article.duration ?? undefined,
            viewCount: article.viewCount ?? undefined,
            mediaType: article.mediaType ?? undefined,
            author: article.author ?? undefined,
            externalId: article.externalId ?? undefined,
            score: article.score ?? undefined,
            durationFormatted: article.durationFormatted ?? undefined,
            read: article.isRead,
            saved: article.isSaved,
            title: article.name,
            published: article.date,
            link: article.url,
            summary,
          };
        }),
        count: response.count || 0,
        page: response.page || 1,
        pageSize: response.pageSize || 20,
        pages: response.pages || 0,
      })),
      tap((response) => {
        const responseItems = response.items || [];
        const responseCount = response.count || 0;
        const hasResponseItems = responseItems.length > 0;

        // Check if we have articles loaded BEFORE updating the signal
        // This helps us determine if a 0 count response is a temporary state during reload
        const hadArticlesBefore = this.articlesSignal().length > 0;
        const previousCount = this.totalCountSignal();

        // CRITICAL: Silent queries (like updateTotalCountAll) use pageSize: 1 and should NOT
        // overwrite the articles array, as they're only used to get the total count.
        // Only update articles for non-silent queries to prevent race conditions where
        // the silent query completes after the main query and overwrites articles with just 1 item.
        if (!silent) {
          this.articlesSignal.set(responseItems);
        }

        // Update totalCount intelligently to prevent paginator from disappearing during reload
        // Strategy:
        // 1. If response has a valid count (> 0), always update
        // 2. If response count is 0 but we have items in response, preserve previous count (inconsistent state)
        // 3. For silent queries, always update count (they're used to get accurate counts)
        // 4. If response count is 0 and no items in response (non-silent):
        //    - If we had articles before, preserve count (temporary empty response during reload)
        //    - If no articles before and previous count was 0, update to 0 (explicit clear)
        //    - If no articles before but previous count > 0, preserve count (wait for accurate count)
        let shouldUpdateCount: boolean;
        if (responseCount > 0) {
          // Always update if we have a valid count
          shouldUpdateCount = true;
        } else if (hasResponseItems && responseCount === 0) {
          // Inconsistent: we have items but count is 0 - preserve previous count
          shouldUpdateCount = false;
        } else if (silent) {
          // Silent queries are used to get accurate counts, so always update
          // This ensures updateTotalCountAll can update the count even if main query returned 0
          shouldUpdateCount = true;
        } else if (hadArticlesBefore) {
          // We had articles before, but response says 0 - likely a temporary state during reload
          // Preserve previous count to keep paginator visible
          shouldUpdateCount = false;
        } else if (previousCount > 0) {
          // No items in response, no articles before, but we had a count > 0
          // This might be a reload scenario - preserve count to keep paginator visible
          shouldUpdateCount = false;
        } else {
          // No items, no articles before, and previous count was 0
          // This is an explicit clear - update to 0
          shouldUpdateCount = true;
        }

        if (shouldUpdateCount) {
          this.totalCountSignal.set(responseCount);
        }

        // Only update pagination state if not a silent/background query
        // Silent queries (like updateTotalCountAll) use pageSize: 1 and shouldn't
        // overwrite the user's selected page size
        if (!silent) {
          this.currentPageSignal.set(response.page || 1);
          this.pageSizeSignal.set(response.pageSize || 20);
          this.loadingSignal.set(false);
        }
      }),
      catchError((error) => {
        console.error("Error loading articles:", error);
        this.errorSignal.set(error.message || "Failed to load articles");
        if (!silent) {
          this.loadingSignal.set(false);
        }
        // Return empty response - don't update pagination state on error
        return of({ items: [], count: 0, page: 1, pageSize: 20, pages: 0 });
      }),
    );
  }

  /**
   * Get a single article by ID
   */
  getArticle(id: number): Observable<ArticleDetail> {
    return from(this.trpc.client.article.getById.query({ id })).pipe(
      map((article) => {
        // Map backend properties to frontend aliases
        let summary = article.content
          ? article.content.substring(0, 200)
          : undefined;
        // Remove base64 images from summary
        if (summary) {
          summary = summary.replace(
            /<img[^>]*src\s*=\s*["']data:image\/[^"']*["'][^>]*>/gi,
            "",
          );
          summary = summary.replace(/<img[^>]*>/gi, "");
        }
        return {
          ...article,
          read: article.isRead,
          saved: article.isSaved,
          title: article.name,
          published: article.date,
          link: article.url,
          summary,
          prevId: article.prevArticleId,
          nextId: article.nextArticleId,
          feed: {
            id: article.feedId,
            name: article.feedName,
            feedType: "", // This would need to come from the feed endpoint if needed
          },
        } as ArticleDetail;
      }),
    );
  }

  /**
   * Mark article as read/unread
   */
  markRead(id: number, read: boolean): Observable<void> {
    return from(
      this.trpc.client.article.markRead.mutate({
        articleIds: [id],
        isRead: read,
      }),
    ).pipe(
      tap(() => {
        // Update article in local state
        const articles = this.articlesSignal();
        const index = articles.findIndex((a) => a.id === id);
        if (index !== -1) {
          const newArticles = [...articles];
          newArticles[index] = {
            ...newArticles[index],
            isRead: read,
            read: read,
          };
          this.articlesSignal.set(newArticles);
        }
      }),
      map(() => undefined),
    );
  }

  /**
   * Mark article as saved/unsaved
   */
  markSaved(id: number, saved: boolean): Observable<void> {
    return from(
      this.trpc.client.article.markSaved.mutate({
        articleIds: [id],
        isSaved: saved,
      }),
    ).pipe(
      tap(() => {
        // Update article in local state
        const articles = this.articlesSignal();
        const index = articles.findIndex((a) => a.id === id);
        if (index !== -1) {
          const newArticles = [...articles];
          newArticles[index] = {
            ...newArticles[index],
            isSaved: saved,
            saved: saved,
          };
          this.articlesSignal.set(newArticles);
        }
      }),
      map(() => undefined),
    );
  }

  /**
   * Delete an article
   */
  deleteArticle(id: number): Observable<void> {
    return from(this.trpc.client.article.delete.mutate({ id })).pipe(
      tap(() => {
        // Remove article from local state
        const articles = this.articlesSignal();
        this.articlesSignal.set(articles.filter((a) => a.id !== id));
        this.totalCountSignal.set(this.totalCountSignal() - 1);
      }),
      map(() => undefined),
    );
  }

  /**
   * Refresh current articles list
   */
  refresh(): void {
    this.loadArticles({ page: this.currentPageSignal() }).subscribe();
  }

  /**
   * Refresh/reload a single article (full refetch and re-extract content)
   * Returns a task ID that can be used to track the reload progress.
   * After reload completes, fetch the article again using getArticle().
   */
  refreshArticle(id: number): Observable<{ success: boolean; taskId: number }> {
    return from(this.trpc.client.article.reload.mutate({ id })).pipe(
      map((response) => ({
        success: response.success || false,
        taskId: response.taskId || 0,
      })),
    );
  }

  /**
   * Poll for task status until it completes or fails.
   * Returns an observable that emits when the task is done.
   */
  pollTaskStatus(
    taskId: number,
    maxAttempts: number = 60,
    intervalMs: number = 1000,
  ): Observable<{ status: string; error?: string }> {
    let attempts = 0;

    const checkTask = (): Observable<{
      status: string;
      error?: string;
    } | null> => {
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error("Task polling timeout: maximum attempts reached");
      }

      return from(
        this.trpc.client.article.getTaskStatus.query({ taskId }),
      ).pipe(
        retry({ count: 3, delay: 500 }),
        map((task) => {
          if (task.status === "completed" || task.status === "failed") {
            return { status: task.status, error: task.error || undefined };
          }
          // Task still pending or running
          return null;
        }),
        catchError(() => {
          // If task not found or other error, continue polling
          return of(null);
        }),
      );
    };

    // Start with immediate check, then poll at intervals using expand
    return checkTask().pipe(
      expand((taskResult) => {
        if (taskResult !== null) {
          // Task completed or failed, stop polling
          return EMPTY;
        }
        // Continue polling after interval
        return timer(intervalMs).pipe(switchMap(() => checkTask()));
      }),
      filter((task) => task !== null),
      take(1),
      map((task) => {
        if (!task) {
          throw new Error("Task polling ended without completion");
        }
        return task;
      }),
    );
  }

  /**
   * Mark all articles in a feed as read
   */
  markAllReadInFeed(
    feedId: number,
  ): Observable<{ count: number; message: string }> {
    const pageSize = 100; // Use a large page size to minimize requests

    // Fetch all article IDs by paginating through all pages
    const fetchAllArticleIds = (
      page: number = 1,
    ): Observable<PaginatedResponse<Article>> => {
      return from(
        this.trpc.client.article.list.query({
          feedId,
          page,
          pageSize,
        }),
      ).pipe(
        map((response) => ({
          items: (response.items || []).map((article) => ({
            ...article,
            thumbnailUrl: article.thumbnailUrl ?? undefined,
            mediaUrl: article.mediaUrl ?? undefined,
            duration: article.duration ?? undefined,
            viewCount: article.viewCount ?? undefined,
            mediaType: article.mediaType ?? undefined,
            author: article.author ?? undefined,
            externalId: article.externalId ?? undefined,
            score: article.score ?? undefined,
            durationFormatted: article.durationFormatted ?? undefined,
          })),
          count: response.count || 0,
          page: response.page || 1,
          pageSize: response.pageSize || 20,
          pages: response.pages || 0,
        })),
      );
    };

    // Use expand to paginate through all pages
    return fetchAllArticleIds(1).pipe(
      expand((response) => {
        // If there are more pages, fetch the next page
        if (response.pages !== undefined && response.page < response.pages) {
          return fetchAllArticleIds(response.page + 1);
        }
        return EMPTY;
      }),
      // Collect all article IDs from all pages
      reduce((acc: number[], response: PaginatedResponse<Article>) => {
        return [...acc, ...(response.items || []).map((a) => a.id)];
      }, []),
      // Mark all articles as read
      switchMap((articleIds) => {
        if (articleIds.length === 0) {
          return of({ count: 0, message: "No articles to mark as read" });
        }

        return from(
          this.trpc.client.article.markRead.mutate({
            articleIds: articleIds,
            isRead: true,
          }),
        ).pipe(
          map((result) => ({
            count: articleIds.length,
            message: "Articles marked as read",
          })),
          tap(() => {
            // Update local state for articles in current view
            const articles = this.articlesSignal();
            const updatedArticles = articles.map((article) => {
              if (articleIds.includes(article.id)) {
                return {
                  ...article,
                  isRead: true,
                  read: true,
                };
              }
              return article;
            });
            this.articlesSignal.set(updatedArticles);
          }),
        );
      }),
      catchError((error) => {
        console.error("Error marking all articles as read:", error);
        throw error;
      }),
    );
  }

  /**
   * Get all article IDs matching the current filters
   */
  private getAllFilteredArticleIds(
    filters: ArticleFilters,
  ): Observable<number[]> {
    const pageSize = 100; // Use a large page size to minimize requests

    const fetchAllArticleIds = (
      page: number = 1,
    ): Observable<PaginatedResponse<Article>> => {
      // Convert readState to isRead boolean, matching loadArticles logic
      let isRead: boolean | undefined = undefined;
      if (filters.read !== undefined) {
        isRead = filters.read;
      } else if (filters.readState === "read") {
        isRead = true;
      } else if (filters.readState === "unread") {
        isRead = false;
      }

      return from(
        this.trpc.client.article.list.query({
          page,
          pageSize,
          feedId: filters.feedId ?? undefined,
          groupId: filters.groupId ?? undefined,
          isRead: isRead,
          isSaved: filters.saved,
          search: filters.search ?? undefined,
          dateFrom: filters.dateFrom
            ? filters.dateFrom instanceof Date
              ? filters.dateFrom.toISOString()
              : filters.dateFrom
            : undefined,
          dateTo: filters.dateTo
            ? filters.dateTo instanceof Date
              ? filters.dateTo.toISOString()
              : filters.dateTo
            : undefined,
        }),
      ).pipe(
        map((response) => ({
          items: (response.items || []).map((article) => ({
            ...article,
            thumbnailUrl: article.thumbnailUrl ?? undefined,
            mediaUrl: article.mediaUrl ?? undefined,
            duration: article.duration ?? undefined,
            viewCount: article.viewCount ?? undefined,
            mediaType: article.mediaType ?? undefined,
            author: article.author ?? undefined,
            externalId: article.externalId ?? undefined,
            score: article.score ?? undefined,
            durationFormatted: article.durationFormatted ?? undefined,
          })),
          count: response.count || 0,
          page: response.page || 1,
          pageSize: response.pageSize || 20,
          pages: response.pages || 0,
        })),
      );
    };

    return fetchAllArticleIds(1).pipe(
      expand((response) => {
        if (response.pages !== undefined && response.page < response.pages) {
          return fetchAllArticleIds(response.page + 1);
        }
        return EMPTY;
      }),
      reduce((acc: number[], response: PaginatedResponse<Article>) => {
        return [...acc, ...(response.items || []).map((a) => a.id)];
      }, []),
    );
  }

  /**
   * Mark all filtered articles as read/unread
   * Uses filter-based endpoint for better performance.
   */
  markAllFilteredRead(
    filters: ArticleFilters,
    isRead: boolean,
  ): Observable<{ count: number; message: string }> {
    // Convert readState to isRead boolean if readState is provided
    let filterIsRead: boolean | undefined = filters.read;
    if (
      filterIsRead === undefined &&
      filters.readState !== undefined &&
      filters.readState !== null
    ) {
      filterIsRead = filters.readState === "read";
    }

    return from(
      this.trpc.client.article.markFilteredRead.mutate({
        feedId: filters.feedId ?? null,
        groupId: filters.groupId ?? null,
        isRead: filterIsRead,
        isSaved: filters.saved,
        search: filters.search ?? null,
        dateFrom: filters.dateFrom
          ? filters.dateFrom instanceof Date
            ? filters.dateFrom.toISOString()
            : filters.dateFrom
          : null,
        dateTo: filters.dateTo
          ? filters.dateTo instanceof Date
            ? filters.dateTo.toISOString()
            : filters.dateTo
          : null,
        isReadValue: isRead,
      }),
    ).pipe(
      map((result) => ({
        count: result.count || 0,
        message: `${result.count || 0} article${result.count !== 1 ? "s" : ""} marked as ${isRead ? "read" : "unread"}`,
      })),
      tap(() => {
        // Optimistically update local state for articles in current view
        // Since we don't know exact IDs, update all articles that match filters
        const articles = this.articlesSignal();
        const updatedArticles = articles.map((article) => {
          // Check if article matches current filters
          let matches = true;
          if (filters.feedId && article.feedId !== filters.feedId) {
            matches = false;
          }
          if (filterIsRead !== undefined) {
            const articleIsRead = article.isRead ?? article.read ?? false;
            if (filterIsRead !== articleIsRead) {
              matches = false;
            }
          }
          if (filters.saved !== undefined) {
            const articleIsSaved = article.isSaved ?? article.saved ?? false;
            if (filters.saved !== articleIsSaved) {
              matches = false;
            }
          }

          if (matches) {
            return {
              ...article,
              isRead,
              read: isRead,
            };
          }
          return article;
        });
        this.articlesSignal.set(updatedArticles);
      }),
      catchError((error) => {
        console.error("Error marking filtered articles:", error);
        throw error;
      }),
    );
  }

  /**
   * Delete all filtered articles
   * Uses filter-based endpoint for better performance.
   */
  deleteAllFiltered(
    filters: ArticleFilters,
  ): Observable<{ count: number; message: string }> {
    // Convert readState to isRead boolean if readState is provided
    let filterIsRead: boolean | undefined = filters.read;
    if (
      filterIsRead === undefined &&
      filters.readState !== undefined &&
      filters.readState !== null
    ) {
      filterIsRead = filters.readState === "read";
    }

    return from(
      this.trpc.client.article.deleteFiltered.mutate({
        feedId: filters.feedId ?? null,
        groupId: filters.groupId ?? null,
        isRead: filterIsRead,
        isSaved: filters.saved,
        search: filters.search ?? null,
        dateFrom: filters.dateFrom
          ? filters.dateFrom instanceof Date
            ? filters.dateFrom.toISOString()
            : filters.dateFrom
          : null,
        dateTo: filters.dateTo
          ? filters.dateTo instanceof Date
            ? filters.dateTo.toISOString()
            : filters.dateTo
          : null,
      }),
    ).pipe(
      map((result) => ({
        count: result.count || 0,
        message: `${result.count || 0} article${result.count !== 1 ? "s" : ""} deleted`,
      })),
      tap(() => {
        // Optimistically remove articles from local state that match filters
        const articles = this.articlesSignal();
        const filteredArticles = articles.filter((article) => {
          // Check if article matches current filters (if it matches, it was deleted)
          let matches = true;
          if (filters.feedId && article.feedId !== filters.feedId) {
            matches = false;
          }
          if (filterIsRead !== undefined) {
            const articleIsRead = article.isRead ?? article.read ?? false;
            if (filterIsRead !== articleIsRead) {
              matches = false;
            }
          }
          if (filters.saved !== undefined) {
            const articleIsSaved = article.isSaved ?? article.saved ?? false;
            if (filters.saved !== articleIsSaved) {
              matches = false;
            }
          }
          // Keep articles that don't match (weren't deleted)
          return !matches;
        });
        this.articlesSignal.set(filteredArticles);
        this.totalCountSignal.set(
          Math.max(
            0,
            this.totalCountSignal() -
              (articles.length - filteredArticles.length),
          ),
        );
      }),
      catchError((error) => {
        console.error("Error deleting filtered articles:", error);
        throw error;
      }),
    );
  }

  /**
   * Refresh all filtered articles
   * Uses filter-based endpoint for better performance.
   */
  refreshAllFiltered(
    filters: ArticleFilters,
  ): Observable<{ count: number; message: string }> {
    // Convert readState to isRead boolean if readState is provided
    let filterIsRead: boolean | undefined = filters.read;
    if (
      filterIsRead === undefined &&
      filters.readState !== undefined &&
      filters.readState !== null
    ) {
      filterIsRead = filters.readState === "read";
    }

    return from(
      this.trpc.client.article.refreshFiltered.mutate({
        feedId: filters.feedId ?? null,
        groupId: filters.groupId ?? null,
        isRead: filterIsRead,
        isSaved: filters.saved,
        search: filters.search ?? null,
        dateFrom: filters.dateFrom
          ? filters.dateFrom instanceof Date
            ? filters.dateFrom.toISOString()
            : filters.dateFrom
          : null,
        dateTo: filters.dateTo
          ? filters.dateTo instanceof Date
            ? filters.dateTo.toISOString()
            : filters.dateTo
          : null,
      }),
    ).pipe(
      map((result) => ({
        count: result.count || 0,
        message: `${result.count || 0} article${result.count !== 1 ? "s" : ""} refresh${result.count !== 1 ? "es" : ""} queued`,
      })),
      catchError((error) => {
        console.error("Error refreshing filtered articles:", error);
        throw error;
      }),
    );
  }
}
