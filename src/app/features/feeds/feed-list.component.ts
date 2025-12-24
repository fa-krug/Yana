/**
 * Feed list component - displays and manages RSS feeds.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Displays paginated list of feeds
 * - Search and filter feeds by type and status
 * - Feed management (enable/disable, delete, reload)
 * - Auto-refresh every 30 seconds
 * - Responsive grid layout
 */

// Angular core
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
import { FormControl } from "@angular/forms";
// Angular Material
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { RouterModule, ActivatedRoute } from "@angular/router";
import {
  debounceTime,
  distinctUntilChanged,
  interval,
  Subject,
  takeUntil,
} from "rxjs";

// Application
import { Feed } from "@app/core/models";
import { ArticleService } from "@app/core/services/article.service";
import { ConfirmationService } from "@app/core/services/confirmation.service";
import { FeedService, FeedFilters } from "@app/core/services/feed.service";
import { GroupService } from "@app/core/services/group.service";
import { ConfirmDialogComponent } from "@app/shared/components/confirm-dialog.component";

import { FeedCardComponent } from "./components/feed-card.component";
import { FeedFiltersComponent } from "./components/feed-filters.component";

@Component({
  selector: "app-feed-list",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatDialogModule,
    MatCardModule,
    FeedFiltersComponent,
    FeedCardComponent,
  ],
  template: `
    <div class="feed-list-container container-lg animate-fade-in">
      <div class="header">
        <h1>Feeds</h1>
      </div>

      <mat-card class="filters-card">
        <mat-card-content>
          <app-feed-filters
            [searchControl]="searchControl"
            [typeControl]="typeControl"
            [enabledControl]="enabledControl"
            [groupControl]="groupControl"
          />
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="primary" routerLink="/feeds/create">
            <mat-icon>add</mat-icon>
            Create Feed
          </button>
        </mat-card-actions>
      </mat-card>

      @if (feedService.error()) {
        <div class="state-center error">
          <mat-icon>error</mat-icon>
          <p>{{ feedService.error() }}</p>
          <button mat-raised-button color="primary" (click)="refresh()">
            Retry
          </button>
        </div>
      }

      @if (feedService.feeds().length === 0 && !feedService.loading()) {
        <div class="state-center empty-state">
          <mat-icon>rss_feed</mat-icon>
          <h2>No feeds found</h2>
        </div>
      } @else {
        @if (feedService.loading() && feedService.feeds().length === 0) {
          <div class="state-center loading" aria-live="polite" aria-busy="true">
            <mat-spinner aria-hidden="true"></mat-spinner>
            <p>Loading feeds...</p>
          </div>
        }
        <div class="feed-grid">
          @for (feed of feedService.feeds(); track feed.id) {
            <app-feed-card
              [feed]="feed"
              [reloadingType]="reloadingFeeds().get(feed.id) ?? null"
              [markingAllRead]="markingAllRead().has(feed.id)"
              (toggleEnabled)="toggleEnabled($event)"
              (deleteFeed)="deleteFeed($event)"
              (reloadFeed)="reloadFeed($event.feed, $event.force)"
              (markAllAsRead)="markAllAsRead($event)"
            />
          }
        </div>

        <mat-paginator
          [length]="feedService.totalCount()"
          [pageSize]="feedService.pageSize()"
          [pageIndex]="feedService.currentPage() - 1"
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPageChange($event)"
          showFirstLastButtons
        >
        </mat-paginator>
      }
    </div>
  `,
  styles: [
    `
      .feed-list-container {
        padding: 24px;
      }

      .header {
        margin-bottom: 24px;
      }

      h1 {
        margin: 0;
        font-size: 2.5rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--mat-sys-on-surface);
      }

      .filters-card {
        margin-bottom: 24px;
      }

      mat-card-actions {
        padding: 0 16px 12px 16px !important;
        display: flex;
        gap: 8px;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: flex-end;
      }

      mat-card-actions button {
        font-weight: 500;
        transition: all 0.2s ease;
      }

      mat-card-actions button mat-icon {
        margin-right: 8px;
      }

      .empty-state h2 {
        margin: 16px 0 0 0;
        font-size: 1.5rem;
        font-weight: 500;
      }

      .feed-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 16px;
        margin-bottom: 16px;
        contain: layout;
      }

      mat-paginator {
        margin-top: 16px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
      }

      /* Responsive adjustments */
      @media (max-width: 600px) {
        .feed-list-container {
          padding: 24px 0 !important;
        }

        h1 {
          font-size: 1.5rem;
          margin-bottom: 24px;
        }

        .header {
          padding: 16px;
        }

        .filters-card {
          border-radius: 0;
          margin: 0 0 16px 0;
        }

        mat-card-actions {
          flex-wrap: wrap;
          padding: 8px 10px;
        }

        mat-card-actions button {
          width: 100%;
        }

        .feed-grid {
          grid-template-columns: 1fr;
          gap: 16px;
        }

        mat-paginator {
          margin-top: 0;
          border-radius: 0;
        }
      }

      @media (max-width: 480px) {
        .feed-list-container {
          padding: 16px 8px 24px;
        }

        h1 {
          font-size: 1.75rem;
          padding: 0 8px;
        }

        .header {
          padding: 0 8px;
        }
      }
    `,
  ],
})
export class FeedListComponent implements OnInit, OnDestroy {
  feedService = inject(FeedService);
  groupService = inject(GroupService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private confirmationService = inject(ConfirmationService);
  private articleService = inject(ArticleService);

  readonly searchControl = new FormControl("");
  readonly typeControl = new FormControl<string | null>(null);
  readonly enabledControl = new FormControl<boolean | null>(null);
  readonly groupControl = new FormControl<number | null>(null);

  protected readonly reloadingFeeds = signal<Map<number, "reload" | "force">>(
    new Map(),
  );
  protected readonly markingAllRead = signal<Set<number>>(new Set());
  private readonly destroy$ = new Subject<void>();

  ngOnInit() {
    // Read query parameters and set initial filter values
    const typeParam = this.route.snapshot.queryParams["type"];
    if (
      typeParam &&
      ["article", "youtube", "podcast", "reddit"].includes(typeParam)
    ) {
      this.typeControl.setValue(typeParam, { emitEvent: false });
    }

    // Load groups
    this.groupService.loadGroups().subscribe();

    // Load feeds immediately
    this.loadFeeds();

    // Set up reactive search
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadFeeds());

    this.typeControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadFeeds());

    this.enabledControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadFeeds());

    this.groupControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadFeeds());

    // Auto-refresh every 30 seconds (silent to avoid UI glitches)
    // Disabled in development mode
    if (!isDevMode()) {
      interval(30000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          if (!this.feedService.loading()) {
            this.loadFeeds(true);
          }
        });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFeeds(silent: boolean = false) {
    const filters: FeedFilters = {
      search: this.searchControl.value || undefined,
      feedType:
        (this.typeControl.value as
          | "article"
          | "youtube"
          | "podcast"
          | "reddit"
          | null) || undefined,
      enabled: this.enabledControl.value ?? undefined,
      groupId: this.groupControl.value ?? undefined,
      page: this.feedService.currentPage(),
      pageSize: this.feedService.pageSize(),
    };

    this.feedService.loadFeeds(filters, silent).subscribe();
  }

  refresh() {
    this.loadFeeds();
  }

  onPageChange(event: PageEvent) {
    const filters: FeedFilters = {
      search: this.searchControl.value || undefined,
      feedType:
        (this.typeControl.value as
          | "article"
          | "youtube"
          | "podcast"
          | "reddit"
          | null) || undefined,
      enabled: this.enabledControl.value ?? undefined,
      groupId: this.groupControl.value ?? undefined,
      page: event.pageIndex + 1,
      pageSize: event.pageSize,
    };

    this.feedService.loadFeeds(filters).subscribe();
  }

  reloadFeed(feed: Feed, force: boolean = false) {
    const reloading = new Map(this.reloadingFeeds());
    reloading.set(feed.id, force ? "force" : "reload");
    this.reloadingFeeds.set(reloading);

    this.feedService.reloadFeed(feed.id, force).subscribe({
      next: (response) => {
        const reloading = new Map(this.reloadingFeeds());
        reloading.delete(feed.id);
        this.reloadingFeeds.set(reloading);

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

          // Refresh feeds to get updated disabled state
          const filters: FeedFilters = {
            search: this.searchControl.value || undefined,
            feedType:
              (this.typeControl.value as
                | "article"
                | "youtube"
                | "podcast"
                | "reddit"
                | null) || undefined,
            enabled: this.enabledControl.value ?? undefined,
            groupId: this.groupControl.value ?? undefined,
            page: this.feedService.currentPage(),
            pageSize: this.feedService.pageSize(),
          };

          this.feedService.loadFeeds(filters).subscribe();

          // Also call component's loadFeeds to update UI
          this.loadFeeds();
          return;
        }

        const action = force ? "Force reloaded" : "Reloaded";
        const articlesAdded = response.articlesAdded ?? 0;
        const articlesUpdated = response.articlesUpdated ?? 0;
        const message = force
          ? `${action} ${feed.name}: ${articlesUpdated} articles updated, ${articlesAdded} new articles`
          : `${action} ${feed.name}: ${articlesAdded} new articles`;

        this.snackBar.open(message, "Close", {
          duration: 5000,
          panelClass: ["success-snackbar"],
        });
        this.loadFeeds();
      },
      error: (error) => {
        const reloading = new Map(this.reloadingFeeds());
        reloading.delete(feed.id);
        this.reloadingFeeds.set(reloading);

        this.snackBar.open(`Failed to reload feed: ${error.message}`, "Close", {
          duration: 5000,
          panelClass: ["error-snackbar"],
        });

        // Refresh feeds in case feed was disabled
        this.loadFeeds();
      },
    });
  }

  toggleEnabled(feed: Feed) {
    this.feedService.updateFeed(feed.id, { enabled: !feed.enabled }).subscribe({
      next: () => {
        this.snackBar.open(
          `Feed ${feed.enabled ? "disabled" : "enabled"} successfully`,
          "Close",
          {
            duration: 3000,
            panelClass: ["success-snackbar"],
          },
        );
      },
      error: (error) => {
        this.snackBar.open(`Failed to update feed: ${error.message}`, "Close", {
          duration: 5000,
        });
      },
    });
  }

  deleteFeed(feed: Feed) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Delete Feed",
        message: `Are you sure you want to delete "${feed.name}"? This will also delete all associated articles.`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmColor: "warn",
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.feedService.deleteFeed(feed.id).subscribe({
          next: () => {
            this.snackBar.open(`Deleted ${feed.name}`, "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
          },
          error: (error) => {
            this.snackBar.open(
              `Failed to delete feed: ${error.message}`,
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

  markAllAsRead(feed: Feed) {
    const articleCount = feed.articleCount || 0;
    if (articleCount === 0) {
      this.snackBar.open("No articles to mark as read", "Close", {
        duration: 3000,
      });
      return;
    }

    this.confirmationService
      .confirm({
        title: "Mark All as Read",
        message: `Are you sure you want to mark all ${articleCount} article${articleCount !== 1 ? "s" : ""} in "${feed.name}" as read?`,
        confirmText: "Mark All as Read",
        cancelText: "Cancel",
        confirmColor: "primary",
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          const marking = new Set(this.markingAllRead());
          marking.add(feed.id);
          this.markingAllRead.set(marking);

          this.articleService.markAllReadInFeed(feed.id).subscribe({
            next: (result) => {
              const marking = new Set(this.markingAllRead());
              marking.delete(feed.id);
              this.markingAllRead.set(marking);

              this.snackBar.open(result.message, "Close", {
                duration: 5000,
                panelClass: ["success-snackbar"],
              });
            },
            error: (error) => {
              const marking = new Set(this.markingAllRead());
              marking.delete(feed.id);
              this.markingAllRead.set(marking);

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
}
