/**
 * Feed detail component - displays feed details and articles.
 */

import { CommonModule } from "@angular/common";
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
  isDevMode,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
// Material imports
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { PageEvent } from "@angular/material/paginator";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import {
  ActivatedRoute,
  Router,
  RouterModule,
  NavigationEnd,
} from "@angular/router";
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  interval,
  Subject,
  takeUntil,
  catchError,
  of,
} from "rxjs";
import { filter } from "rxjs/operators";

import { Feed, Article } from "@app/core/models";
import {
  ArticleService,
  ArticleFilters,
} from "@app/core/services/article.service";
import { BreadcrumbService } from "@app/core/services/breadcrumb.service";
import { ConfirmationService } from "@app/core/services/confirmation.service";
import { FeedService } from "@app/core/services/feed.service";

import { FeedArticlesListComponent } from "./components/feed-articles-list.component";
import { FeedHeaderComponent } from "./components/feed-header.component";

@Component({
  selector: "app-feed-detail",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    FeedHeaderComponent,
    FeedArticlesListComponent,
  ],
  template: `
    <div class="feed-detail-container container-md animate-fade-in">
      @if (hasArticleRoute()) {
        <router-outlet></router-outlet>
      } @else {
        @if (loadingFeed()) {
          <div class="state-center loading" aria-live="polite" aria-busy="true">
            <mat-spinner aria-hidden="true"></mat-spinner>
            <p>Loading feed...</p>
          </div>
        } @else if (feedError()) {
          <div class="state-center error">
            <mat-icon>error</mat-icon>
            <p>{{ feedError() }}</p>
            <button mat-raised-button color="primary" routerLink="/feeds">
              Back to Feeds
            </button>
          </div>
        } @else if (feed(); as currentFeed) {
          <app-feed-header
            [feed]="currentFeed"
            [reloadingType]="reloadingType()"
            [markingAllRead]="markingAllRead()"
            [feedImageError]="feedImageError"
            (toggleEnabled)="toggleEnabled()"
            (clearArticles)="clearArticles()"
            (deleteFeed)="deleteFeed()"
            (reloadFeed)="reloadFeed($event)"
            (markAllAsRead)="markAllAsRead()"
            (imageError)="feedImageError = true"
          />

          <app-feed-articles-list
            [feedId]="currentFeed.id"
            [articleService]="articleService"
            [searchControl]="searchControl"
            [filterControl]="filterControl"
            (refreshArticles)="refreshArticles()"
            (pageChange)="onPageChange($event)"
            (toggleRead)="toggleRead($event)"
            (toggleSaved)="toggleSaved($event)"
            (deleteArticle)="deleteArticle($event)"
          />
        }
      }
    </div>
  `,
  styles: [
    `
      .feed-detail-container {
        padding: 0;
      }

      .empty-state h3 {
        margin: 16px 0 8px 0;
        font-size: 1.5rem;
        font-weight: 500;
      }

      .empty-state p {
        margin: 0 0 24px 0;
        color: rgba(0, 0, 0, 0.6);
        font-size: 1rem;
      }
    `,
  ],
})
export class FeedDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private feedService = inject(FeedService);
  private breadcrumbService = inject(BreadcrumbService);
  private confirmationService = inject(ConfirmationService);
  articleService = inject(ArticleService);

  protected readonly feed = signal<Feed | null>(null);
  protected readonly loadingFeed = signal(true);
  protected readonly feedError = signal<string | null>(null);
  protected feedImageError = false;
  protected readonly reloadingType = signal<"reload" | "force" | null>(null);
  protected readonly markingAllRead = signal<boolean>(false);

  protected readonly searchControl = new FormControl("");
  protected readonly filterControl = new FormControl<string | null>(null);
  private readonly destroy$ = new Subject<void>();
  protected readonly hasArticleRoute = signal<boolean>(false);

  private checkArticleRoute() {
    const firstChild = this.route.snapshot.firstChild;
    this.hasArticleRoute.set(
      firstChild?.routeConfig?.path === "articles/:articleId" ||
        firstChild?.routeConfig?.path?.includes("articles") === true,
    );
  }

  ngOnInit() {
    // Check for article route initially
    this.checkArticleRoute();

    // Listen for route changes to update article route status
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        this.checkArticleRoute();
      });

    this.route.params
      .pipe(
        switchMap((params) => {
          const feedId = Number(params["id"]);
          this.loadingFeed.set(true);
          this.feedError.set(null);
          return this.feedService.getFeed(feedId).pipe(
            catchError((error) => {
              this.feedError.set(
                error.error?.detail || error.message || "Failed to load feed",
              );
              this.loadingFeed.set(false);
              return of(null);
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (feed) => {
          this.loadingFeed.set(false);
          if (feed) {
            this.feed.set(feed);
            // Update breadcrumb with feed name
            this.breadcrumbService.setLabel(`id:${feed.id}`, feed.name);
            this.loadArticles();

            // Check if we should trigger article fetching (from feed creation)
            const shouldFetch =
              this.route.snapshot.queryParams["fetch"] === "true";
            if (shouldFetch) {
              // Remove query parameter from URL
              this.router.navigate(["/feeds", feed.id], { replaceUrl: true });
              // Trigger article fetching
              this.reloadFeed(false);
            }
          }
        },
        error: (error) => {
          this.feedError.set(
            error.error?.detail || error.message || "Failed to load feed",
          );
          this.loadingFeed.set(false);
        },
      });

    // Set up reactive search
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadArticles());

    this.filterControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Reset to page 1 when filter changes
        this.loadArticles(true);
      });

    // Auto-refresh articles every 30 seconds (silent to avoid UI glitches)
    // Disabled in development mode
    if (!isDevMode()) {
      interval(30000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          if (!this.articleService.loading() && this.feed()) {
            this.loadArticles(false, true);
          }
        });
    }
  }

  ngOnDestroy() {
    // Clear breadcrumb label when leaving
    const currentFeed = this.feed();
    if (currentFeed) {
      this.breadcrumbService.clearLabel(`id:${currentFeed.id}`);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadArticles(resetPage: boolean = false, silent: boolean = false) {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    const filters: ArticleFilters = {
      feedId: currentFeed.id,
      search: this.searchControl.value || undefined,
      page: resetPage ? 1 : this.articleService.currentPage(),
      pageSize: this.articleService.pageSize(),
    };

    // Apply read/saved filters
    const filterValue = this.filterControl.value;
    if (filterValue === "unread") {
      filters.readState = "unread";
    }

    this.articleService.loadArticles(filters, silent).subscribe();
  }

  refreshArticles() {
    this.loadArticles();
  }

  onPageChange(event: PageEvent) {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    const filters: ArticleFilters = {
      feedId: currentFeed.id,
      search: this.searchControl.value || undefined,
      page: event.pageIndex + 1,
      pageSize: event.pageSize,
    };

    const filterValue = this.filterControl.value;
    if (filterValue === "unread") {
      filters.readState = "unread";
    }

    this.articleService.loadArticles(filters).subscribe();
  }

  reloadFeed(force: boolean = false) {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    this.reloadingType.set(force ? "force" : "reload");

    this.feedService.reloadFeed(currentFeed.id, force).subscribe({
      next: (response) => {
        this.reloadingType.set(null);

        // Check if the operation failed (e.g., feed was disabled)
        if (!response.success) {
          // Show error message with error styling
          this.snackBar.open(
            response.message || "Failed to reload feed",
            "Close",
            {
              duration: 7000,
              panelClass: ["error-snackbar"],
            },
          );

          // Refresh feed data to get updated disabled state
          this.feedService.getFeed(currentFeed.id).subscribe({
            next: (updatedFeed) => {
              this.feed.set(updatedFeed);
              // Update breadcrumb with updated feed name
              this.breadcrumbService.setLabel(
                `id:${updatedFeed.id}`,
                updatedFeed.name,
              );
            },
          });
          this.loadArticles();
          return;
        }

        const action = force ? "Force reloaded" : "Reloaded";
        const articlesAdded = response.articlesAdded ?? 0;
        const articlesUpdated = response.articlesUpdated ?? 0;
        const message = force
          ? `${action} feed: ${articlesUpdated} articles updated, ${articlesAdded} new articles`
          : `${action} feed: ${articlesAdded} new articles`;

        this.snackBar.open(message, "Close", {
          duration: 5000,
          panelClass: ["success-snackbar"],
        });

        // Refresh feed data and articles
        this.feedService.getFeed(currentFeed.id).subscribe({
          next: (updatedFeed) => {
            this.feed.set(updatedFeed);
            // Update breadcrumb with updated feed name
            this.breadcrumbService.setLabel(
              `id:${updatedFeed.id}`,
              updatedFeed.name,
            );
          },
        });
        this.loadArticles();
      },
      error: (error) => {
        this.reloadingType.set(null);
        this.snackBar.open(`Failed to reload feed: ${error.message}`, "Close", {
          duration: 5000,
          panelClass: ["error-snackbar"],
        });

        // Refresh feed data in case it was disabled
        this.feedService.getFeed(currentFeed.id).subscribe({
          next: (updatedFeed) => {
            this.feed.set(updatedFeed);
            // Update breadcrumb with updated feed name
            this.breadcrumbService.setLabel(
              `id:${updatedFeed.id}`,
              updatedFeed.name,
            );
          },
        });
      },
    });
  }

  toggleEnabled() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    this.feedService
      .updateFeed(currentFeed.id, { enabled: !currentFeed.enabled })
      .subscribe({
        next: (updatedFeed) => {
          this.feed.set(updatedFeed);
          // Update breadcrumb with updated feed name
          this.breadcrumbService.setLabel(
            `id:${updatedFeed.id}`,
            updatedFeed.name,
          );
          this.snackBar.open(
            `Feed ${updatedFeed.enabled ? "enabled" : "disabled"} successfully`,
            "Close",
            { duration: 3000, panelClass: ["success-snackbar"] },
          );
        },
        error: (error) => {
          this.snackBar.open(
            `Failed to update feed: ${error.message}`,
            "Close",
            { duration: 5000 },
          );
        },
      });
  }

  clearArticles() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    const articleCount = currentFeed.articleCount || 0;
    if (articleCount === 0) {
      this.snackBar.open("This feed has no articles to clear", "Close", {
        duration: 3000,
      });
      return;
    }

    this.confirmationService
      .confirm({
        title: "Clear Articles",
        message: `Are you sure you want to delete all ${articleCount} article${articleCount !== 1 ? "s" : ""} from "${currentFeed.name}"? This action cannot be undone.`,
        confirmText: "Clear All",
        cancelText: "Cancel",
        confirmColor: "warn",
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.feedService.clearFeedArticles(currentFeed.id).subscribe({
          next: (response) => {
            this.snackBar.open(
              response.message || "Articles cleared successfully",
              "Close",
              {
                duration: 5000,
                panelClass: ["success-snackbar"],
              },
            );
            // Refresh feed data and articles
            this.feedService.getFeed(currentFeed.id).subscribe({
              next: (updatedFeed) => {
                this.feed.set(updatedFeed);
                this.breadcrumbService.setLabel(
                  `id:${updatedFeed.id}`,
                  updatedFeed.name,
                );
              },
            });
            this.loadArticles(true);
          },
          error: (error) => {
            this.snackBar.open(
              `Failed to clear articles: ${error.message}`,
              "Close",
              {
                duration: 5000,
              },
            );
          },
        });
      });
  }

  deleteFeed() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    if (
      !confirm(
        `Are you sure you want to delete "${currentFeed.name}"? This will also delete all associated articles.`,
      )
    ) {
      return;
    }

    this.feedService.deleteFeed(currentFeed.id).subscribe({
      next: () => {
        this.snackBar.open(`Deleted ${currentFeed.name}`, "Close", {
          duration: 3000,
          panelClass: ["success-snackbar"],
        });
        this.router.navigate(["/feeds"]);
      },
      error: (error) => {
        this.snackBar.open(`Failed to delete feed: ${error.message}`, "Close", {
          duration: 5000,
        });
      },
    });
  }

  toggleRead(article: Article) {
    const currentRead = article.read || article.isRead || false;
    this.articleService.markRead(article.id, !currentRead).subscribe({
      error: (error) => {
        this.snackBar.open(
          `Failed to update article: ${error.message}`,
          "Close",
          {
            duration: 3000,
          },
        );
      },
    });
  }

  toggleSaved(article: Article) {
    const currentSaved = article.saved || article.isSaved || false;
    this.articleService.markSaved(article.id, !currentSaved).subscribe({
      error: (error) => {
        this.snackBar.open(
          `Failed to update article: ${error.message}`,
          "Close",
          {
            duration: 3000,
          },
        );
      },
    });
  }

  markAllAsRead() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    const articleCount = currentFeed.articleCount || 0;
    if (articleCount === 0) {
      this.snackBar.open("No articles to mark as read", "Close", {
        duration: 3000,
      });
      return;
    }

    this.confirmationService
      .confirm({
        title: "Mark All as Read",
        message: `Are you sure you want to mark all ${articleCount} article${articleCount !== 1 ? "s" : ""} in "${currentFeed.name}" as read?`,
        confirmText: "Mark All as Read",
        cancelText: "Cancel",
        confirmColor: "primary",
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.markingAllRead.set(true);

          this.articleService.markAllReadInFeed(currentFeed.id).subscribe({
            next: (result) => {
              this.markingAllRead.set(false);

              this.snackBar.open(result.message, "Close", {
                duration: 5000,
                panelClass: ["success-snackbar"],
              });

              // Refresh the feed to update article count
              this.feedService.getFeed(currentFeed.id).subscribe({
                next: (updatedFeed) => {
                  if (updatedFeed) {
                    this.feed.set(updatedFeed);
                  }
                },
              });

              // Reload articles to reflect the read state
              this.loadArticles(true);
            },
            error: (error) => {
              this.markingAllRead.set(false);

              this.snackBar.open(
                `Failed to mark articles as read: ${error.message}`,
                "Close",
                {
                  duration: 5000,
                },
              );
            },
          });
        }
      });
  }

  deleteArticle(article: Article) {
    const title = article.title || article.name || "this article";
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    this.articleService.deleteArticle(article.id).subscribe({
      next: () => {
        this.snackBar.open(`Deleted article`, "Close", {
          duration: 3000,
          panelClass: ["success-snackbar"],
        });
      },
      error: (error) => {
        this.snackBar.open(
          `Failed to delete article: ${error.message}`,
          "Close",
          {
            duration: 3000,
          },
        );
      },
    });
  }
}
