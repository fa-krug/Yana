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
import { MatMenuModule } from "@angular/material/menu";

// Application
import {
  ArticleService,
  ArticleFilters,
} from "@app/core/services/article.service";
import { FeedService } from "@app/core/services/feed.service";
import { GroupService } from "@app/core/services/group.service";
import { Article } from "@app/core/models";
import { ArticleFiltersComponent } from "./components/article-filters.component";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "@app/shared/components/confirm-dialog.component";
import { getProxiedImageUrl } from "@app/core/utils/image-proxy.util";

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
    MatMenuModule,
    ArticleFiltersComponent,
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
        <div class="article-list">
          @for (article of articleService.articles(); track article.id) {
            <mat-card class="article-card" [class.unread]="!article.isRead">
              <div class="article-header">
                @if (
                  article.thumbnailUrl && !articleImageErrors()[article.id]
                ) {
                  <img
                    [src]="getProxiedImageUrl(article.thumbnailUrl)"
                    [alt]="article.title || article.name"
                    class="article-thumbnail"
                    loading="lazy"
                    [routerLink]="['/articles', article.id]"
                    (error)="onArticleImageError(article.id)"
                  />
                }
                <div class="article-info">
                  <h3 [routerLink]="['/articles', article.id]">
                    {{ article.title || article.name }}
                  </h3>
                  <div class="article-meta">
                    <span class="article-date">
                      <mat-icon>schedule</mat-icon>
                      {{ article.published || article.date | date: "short" }}
                    </span>
                    @if (article.author) {
                      <span class="article-author">
                        <mat-icon>person</mat-icon>
                        {{ article.author }}
                      </span>
                    }
                  </div>
                </div>
                <div class="article-actions">
                  <button
                    mat-icon-button
                    [color]="article.read || article.isRead ? 'primary' : ''"
                    (click)="toggleRead($event, article)"
                    [matTooltip]="
                      article.read || article.isRead
                        ? 'Mark as unread'
                        : 'Mark as read'
                    "
                    [attr.aria-label]="
                      article.read || article.isRead
                        ? 'Mark as unread'
                        : 'Mark as read'
                    "
                    [attr.aria-pressed]="article.read || article.isRead"
                  >
                    <mat-icon>{{
                      article.read || article.isRead
                        ? "check_circle"
                        : "radio_button_unchecked"
                    }}</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    [color]="article.saved || article.isSaved ? 'accent' : ''"
                    (click)="toggleSaved($event, article)"
                    [matTooltip]="
                      article.saved || article.isSaved ? 'Unsave' : 'Save'
                    "
                    [attr.aria-label]="
                      article.saved || article.isSaved
                        ? 'Unsave article'
                        : 'Save article'
                    "
                    [attr.aria-pressed]="article.saved || article.isSaved"
                  >
                    <mat-icon>{{
                      article.saved || article.isSaved
                        ? "bookmark"
                        : "bookmark_border"
                    }}</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    [matMenuTriggerFor]="articleMenu"
                    aria-label="Article options menu"
                  >
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #articleMenu="matMenu">
                    <button
                      mat-menu-item
                      [routerLink]="['/articles', article.id]"
                    >
                      <mat-icon>open_in_new</mat-icon>
                      <span>View Article</span>
                    </button>
                    @if (article.link || article.url) {
                      <a
                        mat-menu-item
                        [href]="article.link || article.url"
                        target="_blank"
                      >
                        <mat-icon>link</mat-icon>
                        <span>Open Original</span>
                      </a>
                    }
                  </mat-menu>
                </div>
              </div>
            </mat-card>
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

      .article-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 24px;
        contain: layout;
      }

      .article-card {
        padding: 24px;
        cursor: default;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 12px;
        position: relative;
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(0, 0, 0, 0.06);
        contain: layout style paint;
      }

      .article-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
        border-color: rgba(25, 118, 210, 0.2);
        background: rgba(255, 255, 255, 0.8);
      }

      .article-card.unread {
        border-left: 5px solid #1976d2;
        background: rgba(25, 118, 210, 0.02);
      }

      .article-card.unread::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 5px;
        background: linear-gradient(180deg, #1976d2, #2196f3, #2196f3);
        border-radius: 12px 0 0 12px;
        box-shadow: 0 0 8px rgba(25, 118, 210, 0.3);
      }

      .article-card.unread:hover {
        background: rgba(25, 118, 210, 0.05);
      }

      .article-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
      }

      .article-thumbnail {
        width: 120px;
        height: 120px;
        object-fit: cover;
        border-radius: 8px;
        flex-shrink: 0;
        cursor: pointer;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
      }

      .article-thumbnail:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .article-info {
        flex: 1;
        min-width: 0;
      }

      .article-info h3 {
        margin: 0 0 14px 0;
        font-size: 1.375rem;
        font-weight: 600;
        color: var(--mat-sys-primary);
        cursor: pointer;
        text-decoration: none;
        line-height: 1.4;
        transition: all 0.2s ease;
        letter-spacing: -0.01em;
      }

      .article-info h3:hover {
        color: var(--mat-sys-primary-container);
        text-decoration: underline;
        transform: translateX(2px);
      }

      .article-meta {
        display: flex;
        gap: 20px;
        align-items: center;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        flex-wrap: wrap;
      }

      .article-meta span {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .article-date {
        color: rgba(128, 128, 128, 0.9) !important;
      }

      .article-meta mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        opacity: 0.7;
      }

      .article-actions {
        display: flex;
        gap: 4px;
        align-items: flex-start;
        flex-shrink: 0;
      }

      .article-actions button {
        transition: transform 0.2s ease;
      }

      .article-actions button:hover {
        transform: scale(1.1);
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

        .article-card {
          padding: 14px 10px;
          border-radius: 0;
        }

        .article-header {
          flex-direction: column;
          gap: 12px;
        }

        .article-thumbnail {
          width: 100%;
          height: 200px;
          align-self: center;
        }

        .article-actions {
          align-self: flex-end;
        }
      }

      :host-context(.dark-theme) {
        .article-card {
          background: rgba(30, 30, 30, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .article-card:hover {
          background: rgba(40, 40, 40, 0.9) !important;
        }

        .article-card.unread {
          background: rgba(30, 30, 30, 0.8) !important;
          border-left-color: var(--mat-sys-primary) !important;
        }

        .article-card.unread::before {
          background: linear-gradient(
            180deg,
            var(--mat-primary-200),
            var(--mat-sys-primary),
            var(--mat-primary-50)
          ) !important;
          box-shadow: 0 0 8px rgba(var(--mat-sys-primary-rgb), 0.3) !important;
        }

        .article-card.unread:hover {
          background: rgba(40, 40, 40, 0.9) !important;
        }

        .article-meta {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .article-date {
          color: rgba(255, 255, 255, 0.8) !important;
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

  private readonly articleImageErrorsSignal = signal<Record<number, boolean>>(
    {},
  );
  protected readonly articleImageErrors =
    this.articleImageErrorsSignal.asReadonly();

  protected readonly getProxiedImageUrl = getProxiedImageUrl;

  private destroy$ = new Subject<void>();

  protected onArticleImageError(articleId: number): void {
    const errors = { ...this.articleImageErrorsSignal() };
    errors[articleId] = true;
    this.articleImageErrorsSignal.set(errors);
  }

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
