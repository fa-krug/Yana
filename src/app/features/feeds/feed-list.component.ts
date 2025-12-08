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
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule, ActivatedRoute } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";

// RxJS
import {
  debounceTime,
  distinctUntilChanged,
  interval,
  Subject,
  takeUntil,
} from "rxjs";

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
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatTooltipModule } from "@angular/material/tooltip";

// Application
import { FeedService, FeedFilters } from "../../core/services/feed.service";
import { Feed, Group } from "../../core/models";
import { ConfirmDialogComponent } from "../../shared/components/confirm-dialog.component";
import { ConfirmationService } from "../../core/services/confirmation.service";
import { ArticleService } from "../../core/services/article.service";
import { GroupService } from "../../core/services/group.service";

@Component({
  selector: "app-feed-list",
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
    MatDialogModule,
    MatTooltipModule,
  ],
  template: `
    <div class="feed-list-container container-lg animate-fade-in">
      <div class="header">
        <h1>Feeds</h1>
        <button mat-raised-button color="primary" routerLink="/feeds/create">
          <mat-icon>add</mat-icon>
          Create Feed
        </button>
      </div>

      <div class="filters">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search feeds</mat-label>
          <input matInput [formControl]="searchControl" />
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Feed Type</mat-label>
          <mat-select [formControl]="typeControl">
            <mat-option [value]="null">All Types</mat-option>
            <mat-option value="article">Articles</mat-option>
            <mat-option value="youtube">YouTube</mat-option>
            <mat-option value="podcast">Podcasts</mat-option>
            <mat-option value="reddit">Reddit</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Status</mat-label>
          <mat-select [formControl]="enabledControl">
            <mat-option [value]="null">All</mat-option>
            <mat-option [value]="true">Enabled</mat-option>
            <mat-option [value]="false">Disabled</mat-option>
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
      </div>

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
            <mat-card class="feed-card card-elevated card-gradient-bar">
              <mat-card-header>
                <div class="feed-avatar">
                  @if (feed.icon && !imageErrors[feed.id]) {
                    <img
                      [src]="feed.icon"
                      [alt]="feed.name"
                      class="feed-image"
                      loading="lazy"
                      (error)="imageErrors[feed.id] = true"
                    />
                  }
                  @if (!feed.icon || imageErrors[feed.id]) {
                    <mat-icon [class]="'feed-icon ' + feed.feedType">
                      {{ getFeedIcon(feed.feedType) }}
                    </mat-icon>
                  }
                </div>
                <div class="feed-header-content">
                  <mat-card-title
                    [routerLink]="['/feeds', feed.id]"
                    class="feed-title-link"
                    >{{ feed.name }}</mat-card-title
                  >
                  <mat-card-subtitle>{{ feed.identifier }}</mat-card-subtitle>
                </div>
                <button
                  mat-icon-button
                  [matMenuTriggerFor]="menu"
                  class="card-menu"
                  aria-label="Feed options menu"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item [routerLink]="['/feeds', feed.id]">
                    <mat-icon>visibility</mat-icon>
                    <span>View Details</span>
                  </button>
                  <button
                    mat-menu-item
                    [routerLink]="['/feeds', feed.id, 'edit']"
                  >
                    <mat-icon>edit</mat-icon>
                    <span>Edit</span>
                  </button>
                  <button mat-menu-item (click)="toggleEnabled(feed)">
                    <mat-icon>{{
                      feed.enabled ? "pause" : "play_arrow"
                    }}</mat-icon>
                    <span>{{ feed.enabled ? "Disable" : "Enable" }}</span>
                  </button>
                  <button
                    mat-menu-item
                    (click)="deleteFeed(feed)"
                    class="delete-action"
                  >
                    <mat-icon>delete</mat-icon>
                    <span>Delete</span>
                  </button>
                </mat-menu>
              </mat-card-header>
              <mat-card-content>
                <div class="feed-meta">
                  <mat-chip-set>
                    <mat-chip
                      [class]="
                        feed.enabled ? 'status-enabled' : 'status-disabled'
                      "
                    >
                      {{ feed.enabled ? "Enabled" : "Disabled" }}
                    </mat-chip>
                    <mat-chip>{{ feed.feedType }}</mat-chip>
                    <mat-chip>
                      <mat-icon>article</mat-icon>
                      {{ feed.articleCount || 0 }} articles
                    </mat-chip>
                    @if (feed.groups && feed.groups.length > 0) {
                      @for (group of feed.groups; track group.id) {
                        <mat-chip class="group-chip">
                          <mat-icon>folder</mat-icon>
                          {{ group.name }}
                        </mat-chip>
                      }
                    }
                  </mat-chip-set>
                </div>
                @if (feed.description) {
                  <p class="feed-description">{{ feed.description }}</p>
                }
                @if (feed.lastAggregated) {
                  <p class="feed-last-aggregated">
                    <mat-icon>schedule</mat-icon>
                    Last updated: {{ feed.lastAggregated | date: "short" }}
                  </p>
                }
              </mat-card-content>
              <mat-card-actions>
                <button
                  mat-icon-button
                  class="reload-button"
                  [disabled]="reloadingFeeds().has(feed.id) || !feed.enabled"
                  (click)="reloadFeed(feed, false)"
                  matTooltip="Fetch new articles"
                  aria-label="Fetch new articles"
                  [attr.aria-busy]="reloadingFeeds().get(feed.id) === 'reload'"
                >
                  <mat-icon
                    [class.spinning]="
                      reloadingFeeds().get(feed.id) === 'reload'
                    "
                    >refresh</mat-icon
                  >
                </button>
                <button
                  mat-icon-button
                  class="force-reload-button"
                  [disabled]="reloadingFeeds().has(feed.id) || !feed.enabled"
                  (click)="reloadFeed(feed, true)"
                  matTooltip="Force reload existing articles (respects daily limit)"
                  aria-label="Force reload existing articles"
                  [attr.aria-busy]="reloadingFeeds().get(feed.id) === 'force'"
                >
                  <mat-icon
                    [class.spinning]="reloadingFeeds().get(feed.id) === 'force'"
                    >sync</mat-icon
                  >
                </button>
                <button
                  mat-icon-button
                  class="mark-all-read-button"
                  [disabled]="
                    markingAllRead().has(feed.id) ||
                    (feed.articleCount || 0) === 0 ||
                    !feed.enabled
                  "
                  (click)="markAllAsRead(feed)"
                  matTooltip="Mark all articles as read"
                  aria-label="Mark all articles as read"
                  [attr.aria-busy]="markingAllRead().has(feed.id)"
                >
                  <mat-icon [class.spinning]="markingAllRead().has(feed.id)"
                    >done_all</mat-icon
                  >
                </button>
              </mat-card-actions>
            </mat-card>
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
        padding: 0;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      h1 {
        margin: 0;
        font-size: 2.5rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--mat-sys-on-surface);
      }

      .header button {
        height: 48px;
        font-size: 1rem;
        font-weight: 500;
        border-radius: 8px;
        padding: 0 24px;
        transition: all 0.2s ease;
      }

      .header button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .header button mat-icon {
        margin-right: 8px;
      }

      .filters {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        align-items: center;
        flex-wrap: wrap;
        padding: 12px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 12px;
        transition: background 0.2s ease;
      }

      .filters:hover {
        background: rgba(0, 0, 0, 0.04);
      }

      .search-field {
        flex: 1;
        min-width: 300px;
      }

      .filter-field {
        min-width: 150px;
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

      .feed-card {
        cursor: default;
        contain: layout style paint;
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .feed-card mat-card-header {
        position: relative;
        padding: 12px 56px 8px 16px;
        display: flex;
        flex-direction: row;
        align-items: center;
      }

      .feed-header-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding-right: 48px;
      }

      .card-menu {
        position: absolute;
        top: 12px;
        right: 12px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }

      .feed-card:hover .card-menu {
        opacity: 1;
      }

      .feed-avatar {
        width: 40px;
        height: 40px;
        position: relative;
        flex-shrink: 0;
        order: -1;
        margin-right: 12px;
      }

      .feed-image {
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: 50%;
        transition: transform 0.3s ease;
        display: block;
      }

      .feed-card:hover .feed-image {
        transform: scale(1.1);
      }

      .feed-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        transition: transform 0.3s ease;
      }

      .feed-card:hover .feed-icon {
        transform: scale(1.1);
      }

      .feed-card:hover .feed-icon {
        transform: scale(1.1);
      }

      .feed-icon.article {
        color: #1976d2;
      }

      .feed-icon.youtube {
        color: #ff0000;
      }

      .feed-icon.podcast {
        color: #9c27b0;
      }

      .feed-icon.reddit {
        color: #ff4500;
      }

      mat-card-title {
        font-size: 1.125rem !important;
        font-weight: 500 !important;
        margin: 0 0 2px 0 !important;
        line-height: 1.3 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .feed-title-link {
        cursor: pointer;
        transition: color 0.2s ease;
        color: var(--mat-sys-primary);
      }

      .feed-title-link:hover {
        color: var(--mat-sys-primary-container);
        text-decoration: underline;
      }

      mat-card-subtitle {
        font-size: 0.8125rem !important;
        opacity: 0.7;
        margin: 0 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .feed-card mat-card-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 8px 16px !important;
      }

      .feed-meta {
        margin: 8px 0;
      }

      mat-chip {
        font-size: 0.75rem;
        font-weight: 500;
        height: 28px;
        padding: 0 12px;
        border-radius: 14px;
      }

      mat-chip mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        margin-right: 6px;
        vertical-align: middle;
      }

      .status-enabled {
        background-color: #4caf50 !important;
        color: white !important;
      }

      .status-disabled {
        background-color: #9e9e9e !important;
        color: white !important;
      }

      .group-chip {
        background-color: #2196f3 !important;
        color: white !important;
      }

      .feed-description {
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        margin: 6px 0;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .feed-last-aggregated {
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(128, 128, 128, 0.9);
        font-size: 0.75rem;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
      }

      .feed-last-aggregated mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        opacity: 0.7;
      }

      mat-card-actions {
        padding: 6px 16px 12px 16px !important;
        display: flex;
        gap: 8px;
        flex-wrap: nowrap;
        align-items: center;
        margin-top: auto;
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
      }

      mat-card-actions button:hover {
        background: rgba(0, 0, 0, 0.04);
      }

      mat-card-actions {
        justify-content: flex-end;
      }

      mat-card-actions .reload-button {
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

      mat-card-actions .reload-button:hover {
        background-color: #1565c0;
      }

      mat-card-actions .reload-button[disabled] {
        background-color: rgba(25, 118, 210, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions .reload-button mat-icon {
        margin: 0;
        transition: transform 0.3s ease;
      }

      mat-card-actions .reload-button mat-icon.spinning {
        animation: spin 1s linear infinite;
      }

      mat-card-actions .force-reload-button {
        color: white;
        background-color: #e91e63;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      mat-card-actions .force-reload-button:hover {
        background-color: #c2185b;
      }

      mat-card-actions .force-reload-button[disabled] {
        background-color: rgba(233, 30, 99, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions .force-reload-button mat-icon {
        margin: 0;
        transition: transform 0.3s ease;
      }

      mat-card-actions .force-reload-button mat-icon.spinning {
        animation: spin 1s linear infinite;
      }

      mat-card-actions .mark-all-read-button {
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

      mat-card-actions .mark-all-read-button:hover {
        background-color: #45a049;
      }

      mat-card-actions .mark-all-read-button[disabled] {
        background-color: rgba(76, 175, 80, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-card-actions .mark-all-read-button mat-icon {
        margin: 0;
        transition: transform 0.3s ease;
      }

      mat-card-actions .mark-all-read-button mat-icon.spinning {
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

      .delete-action {
        color: #f44336 !important;
      }

      .delete-action:hover {
        background: rgba(244, 67, 54, 0.08) !important;
      }

      mat-paginator {
        margin-top: 16px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
      }

      /* Responsive adjustments */
      @media (max-width: 600px) {
        h1 {
          font-size: 2rem;
          margin-bottom: 24px;
          padding: 0 12px;
        }

        .header {
          flex-direction: column;
          align-items: flex-start;
          gap: 16px;
          padding: 0 12px;
        }

        .header button {
          width: 100%;
        }

        .filters {
          flex-direction: row;
          align-items: stretch;
          padding: 16px 12px;
          width: 100%;
        }

        .search-field,
        .filter-field {
          flex: 1 1 0;
          min-width: 0;
          width: 0;
        }

        .search-field ::ng-deep .mat-mdc-text-field-wrapper,
        .filter-field ::ng-deep .mat-mdc-text-field-wrapper {
          width: 100%;
        }

        .feed-grid {
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .feed-card {
          border-radius: 0;
          margin: 0;
        }

        .feed-card mat-card-header {
          padding: 12px 10px 8px 10px;
        }

        mat-card-actions {
          flex-wrap: wrap;
          padding: 8px 10px;
        }

        mat-paginator {
          margin-top: 0;
          border-radius: 0;
        }
      }

      @media (max-width: 480px) {
        h1 {
          font-size: 1.75rem;
          padding: 0 8px;
        }

        .header {
          padding: 0 8px;
        }

        .filters {
          padding: 12px 8px;
          flex-direction: column;
          width: 100%;
          box-sizing: border-box;
        }

        .search-field,
        .filter-field {
          width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box;
        }

        .search-field ::ng-deep .mat-mdc-text-field-wrapper,
        .filter-field ::ng-deep .mat-mdc-text-field-wrapper {
          box-sizing: border-box;
        }

        .feed-card mat-card-header {
          padding: 10px 8px 6px 8px;
        }

        .feed-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
        }

        mat-card-title {
          font-size: 1.125rem !important;
        }

        mat-card-actions {
          padding: 6px 8px;
        }
      }

      /* Dark mode contrast improvements - component-specific overrides */
      :host-context(.dark-theme) {
        .feed-icon.article {
          color: var(--mat-sys-primary) !important;
        }

        mat-card-actions .reload-button {
          background-color: #2196f3 !important;
        }

        mat-card-actions .reload-button:hover {
          background-color: #bbdefb !important;
        }

        mat-card-actions .reload-button[disabled] {
          background-color: rgba(33, 150, 243, 0.5) !important;
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

  searchControl = new FormControl("");
  typeControl = new FormControl<string | null>(null);
  enabledControl = new FormControl<boolean | null>(null);
  groupControl = new FormControl<number | null>(null);

  imageErrors: Record<number, boolean> = {};

  protected reloadingFeeds = signal<Map<number, "reload" | "force">>(new Map());
  protected markingAllRead = signal<Set<number>>(new Set());
  private destroy$ = new Subject<void>();

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
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.feedService.loading()) {
          this.loadFeeds(true);
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFeeds(silent: boolean = false) {
    const filters: FeedFilters = {
      search: this.searchControl.value || undefined,
      feedType: this.typeControl.value as any,
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
      feedType: this.typeControl.value as any,
      enabled: this.enabledControl.value ?? undefined,
      groupId: this.groupControl.value ?? undefined,
      page: event.pageIndex + 1,
      pageSize: event.pageSize,
    };

    this.feedService.loadFeeds(filters).subscribe();
  }

  getFeedIcon(type: string): string {
    const icons: Record<string, string> = {
      article: "article",
      youtube: "play_circle",
      podcast: "podcast",
      reddit: "forum",
    };
    return icons[type] || "rss_feed";
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
            feedType: this.typeControl.value as any,
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
