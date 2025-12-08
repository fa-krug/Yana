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
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, ActivatedRoute } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";

// RxJS
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from "rxjs";

// Angular Material
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatChipsModule } from "@angular/material/chips";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";

// Application
import {
  ArticleService,
  ArticleFilters,
} from "../../core/services/article.service";
import { FeedService } from "../../core/services/feed.service";
import { GroupService } from "../../core/services/group.service";
import { Article, Group } from "../../core/models";

@Component({
  selector: "app-article-list",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatMenuModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="article-list-container container-lg animate-fade-in">
      <div class="header">
        <h1>Articles</h1>
      </div>

      <div class="filters">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search articles</mat-label>
          <input matInput [formControl]="searchControl" />
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Feed</mat-label>
          <mat-select [formControl]="feedControl">
            <mat-option [value]="null">All Feeds</mat-option>
            @for (feed of feedService.feeds(); track feed.id) {
              <mat-option [value]="feed.id">{{ feed.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Group</mat-label>
          <mat-select [formControl]="groupControl">
            <mat-option [value]="null">All Groups</mat-option>
            @for (group of groupService.groups(); track group.id) {
              <mat-option [value]="group.id">{{ group.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Read State</mat-label>
          <mat-select [formControl]="readStateControl">
            <mat-option [value]="null">All</mat-option>
            <mat-option value="unread">Unread</mat-option>
            <mat-option value="read">Read</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

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
            <mat-card
              class="article-card card-elevated"
              [routerLink]="['/articles', article.id]"
            >
              <mat-card-header>
                <mat-card-title>{{
                  article.title || article.name
                }}</mat-card-title>
                <mat-card-subtitle>
                  <div class="article-meta">
                    <span class="article-date">
                      <mat-icon>schedule</mat-icon>
                      {{ article.published | date: "short" }}
                    </span>
                    @if (article.author) {
                      <span class="article-author">
                        <mat-icon>person</mat-icon>
                        {{ article.author }}
                      </span>
                    }
                  </div>
                </mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                @if (article.thumbnailUrl) {
                  <img
                    [src]="article.thumbnailUrl"
                    [alt]="article.title || article.name"
                    class="article-thumbnail"
                    loading="lazy"
                  />
                }
                <div class="article-tags">
                  <mat-chip-set>
                    @if (article.read || article.isRead) {
                      <mat-chip class="status-read">Read</mat-chip>
                    }
                    @if (article.saved || article.isSaved) {
                      <mat-chip class="status-saved">Saved</mat-chip>
                    }
                    @if (article.isVideo) {
                      <mat-chip>Video</mat-chip>
                    }
                    @if (article.isPodcast) {
                      <mat-chip>Podcast</mat-chip>
                    }
                    @if (article.isReddit) {
                      <mat-chip>Reddit</mat-chip>
                    }
                  </mat-chip-set>
                </div>
              </mat-card-content>
              <mat-card-actions>
                <button
                  mat-button
                  [color]="article.read || article.isRead ? 'primary' : ''"
                  (click)="toggleRead($event, article)"
                  [matTooltip]="
                    article.read || article.isRead
                      ? 'Mark as unread'
                      : 'Mark as read'
                  "
                >
                  <mat-icon>{{
                    article.read || article.isRead
                      ? "check_circle"
                      : "radio_button_unchecked"
                  }}</mat-icon>
                  {{ article.read || article.isRead ? "Read" : "Unread" }}
                </button>
                <button
                  mat-button
                  [color]="article.saved || article.isSaved ? 'accent' : ''"
                  (click)="toggleSaved($event, article)"
                  [matTooltip]="
                    article.saved || article.isSaved ? 'Unsave' : 'Save'
                  "
                >
                  <mat-icon>{{
                    article.saved || article.isSaved
                      ? "bookmark"
                      : "bookmark_border"
                  }}</mat-icon>
                  {{ article.saved || article.isSaved ? "Saved" : "Save" }}
                </button>
                <div class="spacer"></div>
                @if (article.link) {
                  <a
                    mat-icon-button
                    [href]="article.link"
                    target="_blank"
                    (click)="$event.stopPropagation()"
                    matTooltip="Open original"
                  >
                    <mat-icon>open_in_new</mat-icon>
                  </a>
                }
              </mat-card-actions>
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

      .filters {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
        flex-wrap: wrap;
      }

      .search-field {
        flex: 1;
        min-width: 200px;
      }

      .filter-field {
        min-width: 150px;
      }

      .article-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }

      .article-card {
        cursor: pointer;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
      }

      .article-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      }

      .article-meta {
        display: flex;
        gap: 16px;
        align-items: center;
        color: rgba(0, 0, 0, 0.6);
        font-size: 0.875rem;
        margin-top: 8px;
      }

      .article-meta span {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .article-meta mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .article-thumbnail {
        width: 100%;
        height: auto;
        max-height: 200px;
        object-fit: cover;
        border-radius: 4px;
        margin-bottom: 12px;
      }

      .article-tags {
        margin-top: 12px;
      }

      .status-read {
        background-color: #1976d2 !important;
        color: white !important;
      }

      :host-context(.dark-theme) {
        .status-read {
          background-color: #2196f3 !important;
          color: #000000 !important;
        }
      }

      .status-saved {
        background-color: #ff6d00 !important;
        color: white !important;
      }

      mat-card-actions {
        display: flex;
        align-items: center;
        padding: 8px 16px;
      }

      .spacer {
        flex: 1;
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

        .filters {
          flex-direction: column;
          padding: 16px;
        }

        .search-field,
        .filter-field {
          width: 100%;
        }

        .article-grid {
          grid-template-columns: 1fr;
          gap: 0;
        }

        .article-card {
          border-radius: 0;
          margin: 0;
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

  searchControl = new FormControl("");
  feedControl = new FormControl<number | null>(null);
  groupControl = new FormControl<number | null>(null);
  readStateControl = new FormControl<"read" | "unread" | null>(null);

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

  refresh() {
    this.applyFilters();
  }
}
