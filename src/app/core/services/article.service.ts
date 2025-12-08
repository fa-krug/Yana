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
  unreadOnly?: boolean;
  readState?: "read" | "unread" | null;
  search?: string;
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
    if (!silent) {
      this.loadingSignal.set(true);
    }
    this.errorSignal.set(null);

    return from(
      this.trpc.client.article.list.query({
        page: filters.page || 1,
        pageSize: filters.pageSize || 20,
        feedId: filters.feedId,
        groupId: filters.groupId,
        isRead: filters.read,
        isSaved: filters.saved,
        search: filters.search,
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
        this.articlesSignal.set(response.items || []);
        this.totalCountSignal.set(response.count || 0);
        this.currentPageSignal.set(response.page || 1);
        this.pageSizeSignal.set(response.pageSize || 20);
        if (!silent) {
          this.loadingSignal.set(false);
        }
      }),
      catchError((error) => {
        console.error("Error loading articles:", error);
        this.errorSignal.set(error.message || "Failed to load articles");
        if (!silent) {
          this.loadingSignal.set(false);
        }
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
}
