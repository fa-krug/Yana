/**
 * Article list component - displays all articles with pagination, search, and filtering.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Displays paginated list of articles
 * - Search articles by title or content
 * - Filter by feed and read state
 * - Responsive card layout
 */

// Angular core
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, ActivatedRoute } from "@angular/router";
import { FormControl } from "@angular/forms";

// RxJS
import {
  debounceTime,
  distinctUntilChanged,
  Subject,
  takeUntil,
  finalize,
} from "rxjs";

// Angular Material
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatCardModule } from "@angular/material/card";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";

// Application
import {
  ArticleService,
  ArticleFilters,
} from "@app/core/services/article.service";
import { FeedService } from "@app/core/services/feed.service";
import { GroupService } from "@app/core/services/group.service";
import { Article } from "@app/core/models";
import { ArticleFiltersComponent } from "./components/article-filters.component";
import { ArticleCardComponent } from "@app/shared/components/article-card.component";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "@app/shared/components/confirm-dialog.component";

@Component({
  selector: "app-article-list",
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
    MatTooltipModule,
    MatCardModule,
    MatDialogModule,
    ArticleFiltersComponent,
    ArticleCardComponent,
  ],
  template: `
    <div class="article-list-container container-lg animate-fade-in">
      <div class="header">
        <h1>Articles</h1>
      </div>

      <mat-card class="filters-card">
        <mat-card-content>
          <app-article-filters
            [searchControl]="searchControl"
            [feedControl]="feedControl"
            [groupControl]="groupControl"
            [readStateControl]="readStateControl"
            [dateFromControl]="dateFromControl"
            [dateToControl]="dateToControl"
          />
        </mat-card-content>
        <mat-card-actions>
          <button
            mat-icon-button
            class="mark-read-button"
            [disabled]="bulkOperationLoading()"
            (click)="markAllFilteredRead(true)"
            matTooltip="Mark all filtered articles as read"
            aria-label="Mark all filtered articles as read"
            [attr.aria-busy]="bulkOperationLoading() === 'read'"
          >
            <mat-icon [class.spinning]="bulkOperationLoading() === 'read'"
              >check_circle</mat-icon
            >
          </button>
          <button
            mat-icon-button
            class="mark-unread-button"
            [disabled]="bulkOperationLoading()"
            (click)="markAllFilteredRead(false)"
            matTooltip="Mark all filtered articles as unread"
            aria-label="Mark all filtered articles as unread"
            [attr.aria-busy]="bulkOperationLoading() === 'unread'"
          >
            <mat-icon [class.spinning]="bulkOperationLoading() === 'unread'"
              >radio_button_unchecked</mat-icon
            >
          </button>
          <button
            mat-icon-button
            class="delete-button"
            [disabled]="bulkOperationLoading()"
            (click)="deleteAllFiltered()"
            matTooltip="Delete all filtered articles"
            aria-label="Delete all filtered articles"
            [attr.aria-busy]="bulkOperationLoading() === 'delete'"
          >
            <mat-icon [class.spinning]="bulkOperationLoading() === 'delete'"
              >delete</mat-icon
            >
          </button>
          <button
            mat-icon-button
            class="refresh-button"
            [disabled]="bulkOperationLoading()"
            (click)="refreshAllFiltered()"
            matTooltip="Refresh all filtered articles"
            aria-label="Refresh all filtered articles"
            [attr.aria-busy]="bulkOperationLoading() === 'refresh'"
          >
            <mat-icon [class.spinning]="bulkOperationLoading() === 'refresh'"
              >refresh</mat-icon
            >
          </button>
        </mat-card-actions>
      </mat-card>

      @if (articleService.error()) {
        <div class="state-center error">
          <mat-icon>error</mat-icon>
          <p>{{ articleService.error() }}</p>
          <button mat-raised-button color="primary" (click)="refresh()">
            Retry
          </button>
        </div>
      }

      @if (
        articleService.articles().length === 0 && !articleService.loading()
      ) {
        <div class="state-center empty-state">
          <mat-icon>article</mat-icon>
          <h2>No articles found</h2>
        </div>
      } @else {
        @if (
          articleService.loading() && articleService.articles().length === 0
        ) {
          <div class="state-center loading" aria-live="polite" aria-busy="true">
            <mat-spinner aria-hidden="true"></mat-spinner>
            <p>Loading articles...</p>
          </div>
        }
        <div class="article-grid">
          @for (article of articleService.articles(); track article.id) {
            <app-article-card
              [article]="article"
              [articleRoute]="['/articles', article.id.toString()]"
              (toggleRead)="toggleRead($event.event, $event.article)"
              (toggleSaved)="toggleSaved($event.event, $event.article)"
            />
          }
        </div>

        @if (articleService.totalPages() > 1) {
          <mat-paginator
            [length]="articleService.totalCount()"
            [pageSize]="articleService.pageSize()"
            [pageIndex]="articleService.currentPage() - 1"
            [pageSizeOptions]="[10, 20, 50, 100]"
            (page)="onPageChange($event)"
            showFirstLastButtons
          />
        }
      }
    </div>
  `,
  styles: [
    `
      .article-list-container {
        padding: 24px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .header h1 {
        margin: 0;
        font-size: 2rem;
        font-weight: 500;
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

      mat-card-actions button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }

      mat-card-actions button mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        margin: 0;
        transition: transform 0.3s ease;
      }

      mat-card-actions .mark-read-button {
        color: white;
        background-color: #4caf50;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      mat-card-actions .mark-read-button:hover:not([disabled]) {
        background-color: #45a049;
      }

      mat-card-actions .mark-read-button[disabled] {
        background-color: rgba(76, 175, 80, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions .mark-unread-button {
        color: white;
        background-color: #2196f3;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      mat-card-actions .mark-unread-button:hover:not([disabled]) {
        background-color: #1976d2;
      }

      mat-card-actions .mark-unread-button[disabled] {
        background-color: rgba(33, 150, 243, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions .delete-button {
        color: white;
        background-color: #f44336;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      mat-card-actions .delete-button:hover:not([disabled]) {
        background-color: #d32f2f;
      }

      mat-card-actions .delete-button[disabled] {
        background-color: rgba(244, 67, 54, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions .refresh-button {
        color: white;
        background-color: #1976d2;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      mat-card-actions .refresh-button:hover:not([disabled]) {
        background-color: #1565c0;
      }

      mat-card-actions .refresh-button[disabled] {
        background-color: rgba(25, 118, 210, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions button mat-icon.spinning {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      .article-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }

      .state-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 16px;
      }

      .state-center mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
      }

      .state-center.error mat-icon {
        color: #f44336;
      }

      .state-center.empty-state mat-icon {
        color: rgba(0, 0, 0, 0.3);
      }

      .state-center.loading {
        min-height: 200px;
      }

      mat-paginator {
        margin-top: 24px;
      }

      @media (max-width: 600px) {
        .article-list-container {
          padding: 0;
        }

        .header {
          padding: 16px;
        }

        .header h1 {
          font-size: 1.5rem;
        }

        .filters-card {
          border-radius: 0;
          margin: 0 0 16px 0;
        }

        mat-card-actions {
          flex-wrap: wrap;
          padding: 8px 10px;
        }

        .article-grid {
          grid-template-columns: 1fr;
          gap: 16px;
        }
      }
    `,
  ],
})
export class ArticleListComponent implements OnInit, OnDestroy {
  articleService = inject(ArticleService);
  feedService = inject(FeedService);
  groupService = inject(GroupService);
  route = inject(ActivatedRoute);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);

  searchControl = new FormControl<string | null>("");
  feedControl = new FormControl<number | null>(null);
  groupControl = new FormControl<number | null>(null);
  readStateControl = new FormControl<"read" | "unread" | null>(null);
  dateFromControl = new FormControl<Date | null>(null);
  dateToControl = new FormControl<Date | null>(null);

  bulkOperationLoading = signal<
    "read" | "unread" | "delete" | "refresh" | null
  >(null);

  private destroy$ = new Subject<void>();

  ngOnInit() {
    // Load feeds for filter dropdown
    this.feedService.loadFeeds().subscribe();

    // Load groups for filter dropdown
    this.groupService.loadGroups().subscribe();

    // Load articles from query params
    this.route.queryParams.subscribe((params) => {
      const filters: ArticleFilters = {
        page: params["page"] ? Number(params["page"]) : 1,
        pageSize: params["page_size"] ? Number(params["page_size"]) : 20,
      };

      if (params["search"]) {
        filters.search = params["search"];
        this.searchControl.setValue(params["search"], { emitEvent: false });
      }

      if (params["feed_id"]) {
        filters.feedId = Number(params["feed_id"]);
        this.feedControl.setValue(filters.feedId, { emitEvent: false });
      }

      if (params["read_state"]) {
        filters.readState = params["read_state"] as "read" | "unread";
        this.readStateControl.setValue(filters.readState, { emitEvent: false });
      }

      if (params["group_id"]) {
        filters.groupId = Number(params["group_id"]);
        this.groupControl.setValue(filters.groupId, { emitEvent: false });
      }

      if (params["date_from"]) {
        const dateFrom = new Date(params["date_from"]);
        if (!isNaN(dateFrom.getTime())) {
          filters.dateFrom = dateFrom;
          this.dateFromControl.setValue(dateFrom, { emitEvent: false });
        }
      }

      if (params["date_to"]) {
        const dateTo = new Date(params["date_to"]);
        if (!isNaN(dateTo.getTime())) {
          filters.dateTo = dateTo;
          this.dateToControl.setValue(dateTo, { emitEvent: false });
        }
      }

      this.articleService.loadArticles(filters).subscribe();
    });

    // Debounce search input
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });

    // Watch filter changes
    this.feedControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });

    this.readStateControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });

    this.groupControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });

    this.dateFromControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });

    this.dateToControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilters();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilters() {
    const filters: ArticleFilters = {
      page: 1, // Reset to first page when filters change
      pageSize: this.articleService.pageSize(),
    };

    const search = this.searchControl.value?.trim();
    if (search) {
      filters.search = search;
    }

    const feedId = this.feedControl.value;
    if (feedId) {
      filters.feedId = feedId;
    }

    const readState = this.readStateControl.value;
    if (readState) {
      filters.readState = readState;
    }

    const groupId = this.groupControl.value;
    if (groupId) {
      filters.groupId = groupId;
    }

    const dateFrom = this.dateFromControl.value;
    if (dateFrom) {
      filters.dateFrom = dateFrom;
    }

    const dateTo = this.dateToControl.value;
    if (dateTo) {
      filters.dateTo = dateTo;
    }

    this.articleService.loadArticles(filters).subscribe();
  }

  onPageChange(event: PageEvent) {
    const filters: ArticleFilters = {
      page: event.pageIndex + 1,
      pageSize: event.pageSize,
    };

    const search = this.searchControl.value?.trim();
    if (search) {
      filters.search = search;
    }

    const feedId = this.feedControl.value;
    if (feedId) {
      filters.feedId = feedId;
    }

    const readState = this.readStateControl.value;
    if (readState) {
      filters.readState = readState;
    }

    const groupId = this.groupControl.value;
    if (groupId) {
      filters.groupId = groupId;
    }

    const dateFrom = this.dateFromControl.value;
    if (dateFrom) {
      filters.dateFrom = dateFrom;
    }

    const dateTo = this.dateToControl.value;
    if (dateTo) {
      filters.dateTo = dateTo;
    }

    this.articleService.loadArticles(filters).subscribe();
  }

  toggleRead(event: Event, article: Article) {
    event.stopPropagation();
    const currentRead = article.read ?? article.isRead ?? false;
    this.articleService.markRead(article.id, !currentRead).subscribe({
      next: () => {
        this.snackBar.open(
          `Article marked as ${!currentRead ? "read" : "unread"}`,
          "Close",
          {
            duration: 2000,
            panelClass: ["success-snackbar"],
          },
        );
      },
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

  toggleSaved(event: Event, article: Article) {
    event.stopPropagation();
    const currentSaved = article.saved ?? article.isSaved ?? false;
    this.articleService.markSaved(article.id, !currentSaved).subscribe({
      next: () => {
        this.snackBar.open(
          `Article ${!currentSaved ? "saved" : "unsaved"}`,
          "Close",
          {
            duration: 2000,
            panelClass: ["success-snackbar"],
          },
        );
      },
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

  protected refresh() {
    this.applyFilters();
  }

  protected getCurrentFilters(): ArticleFilters {
    const filters: ArticleFilters = {
      page: 1,
      pageSize: 100, // Use large page size for bulk operations
    };

    const search = this.searchControl.value?.trim();
    if (search) {
      filters.search = search;
    }

    const feedId = this.feedControl.value;
    if (feedId) {
      filters.feedId = feedId;
    }

    const readState = this.readStateControl.value;
    if (readState) {
      filters.readState = readState;
    }

    const groupId = this.groupControl.value;
    if (groupId) {
      filters.groupId = groupId;
    }

    const dateFrom = this.dateFromControl.value;
    if (dateFrom) {
      filters.dateFrom = dateFrom;
    }

    const dateTo = this.dateToControl.value;
    if (dateTo) {
      filters.dateTo = dateTo;
    }

    return filters;
  }

  markAllFilteredRead(isRead: boolean) {
    const loadingType = isRead ? "read" : "unread";
    this.bulkOperationLoading.set(loadingType);

    const filters = this.getCurrentFilters();
    this.articleService
      .markAllFilteredRead(filters, isRead)
      .pipe(
        finalize(() => this.bulkOperationLoading.set(null)),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (result) => {
          this.snackBar.open(result.message, "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          // Refresh the current view
          this.applyFilters();
        },
        error: (error) => {
          this.snackBar.open(
            `Failed to mark articles: ${error.message}`,
            "Close",
            {
              duration: 3000,
            },
          );
        },
      });
  }

  deleteAllFiltered() {
    const dialogData: ConfirmDialogData = {
      title: "Delete Articles",
      message:
        "Are you sure you want to delete all filtered articles? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmColor: "warn",
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: "500px",
      data: dialogData,
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.bulkOperationLoading.set("delete");

        const filters = this.getCurrentFilters();
        this.articleService
          .deleteAllFiltered(filters)
          .pipe(
            finalize(() => this.bulkOperationLoading.set(null)),
            takeUntil(this.destroy$),
          )
          .subscribe({
            next: (result) => {
              this.snackBar.open(result.message, "Close", {
                duration: 3000,
                panelClass: ["success-snackbar"],
              });
              // Refresh the current view
              this.applyFilters();
            },
            error: (error) => {
              this.snackBar.open(
                `Failed to delete articles: ${error.message}`,
                "Close",
                {
                  duration: 3000,
                },
              );
            },
          });
      });
  }

  refreshAllFiltered() {
    this.bulkOperationLoading.set("refresh");

    const filters = this.getCurrentFilters();
    this.articleService
      .refreshAllFiltered(filters)
      .pipe(
        finalize(() => this.bulkOperationLoading.set(null)),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (result) => {
          this.snackBar.open(result.message, "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          // Refresh the current view after a delay to allow tasks to complete
          setTimeout(() => {
            this.applyFilters();
          }, 2000);
        },
        error: (error) => {
          this.snackBar.open(
            `Failed to refresh articles: ${error.message}`,
            "Close",
            {
              duration: 3000,
            },
          );
        },
      });
  }
}
