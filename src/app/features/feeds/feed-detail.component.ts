/**
 * Feed detail component - displays feed details and articles.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  interval,
  Subject,
  takeUntil,
  catchError,
  of,
} from 'rxjs';

// Material imports
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FeedService } from '../../core/services/feed.service';
import { ArticleService, ArticleFilters } from '../../core/services/article.service';
import { BreadcrumbService } from '../../core/services/breadcrumb.service';
import { ConfirmationService } from '../../core/services/confirmation.service';
import { Feed, Article } from '../../core/models';

@Component({
  selector: 'app-feed-detail',
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
    MatDividerModule,
    MatTooltipModule,
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
            <button mat-raised-button color="primary" routerLink="/feeds">Back to Feeds</button>
          </div>
        } @else if (feed(); as currentFeed) {
          <mat-card class="feed-header">
            <mat-card-header>
              <div class="feed-avatar">
                @if (currentFeed.icon && !feedImageError) {
                  <img
                    [src]="currentFeed.icon"
                    [alt]="currentFeed.name"
                    class="feed-image"
                    loading="lazy"
                    (error)="feedImageError = true"
                  />
                }
                @if (!currentFeed.icon || feedImageError) {
                  <mat-icon [class]="'feed-icon ' + currentFeed.feedType">
                    {{ getFeedIcon(currentFeed.feedType) }}
                  </mat-icon>
                }
              </div>
              <mat-card-title>{{ currentFeed.name }}</mat-card-title>
              <mat-card-subtitle>{{ currentFeed.identifier }}</mat-card-subtitle>
              <button
                mat-icon-button
                [matMenuTriggerFor]="menu"
                class="header-menu-button"
                aria-label="Feed options menu"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item [routerLink]="['/feeds', currentFeed.id, 'edit']">
                  <mat-icon>edit</mat-icon>
                  <span>Edit Feed</span>
                </button>
                <button mat-menu-item (click)="toggleEnabled()">
                  <mat-icon>{{ currentFeed.enabled ? 'pause' : 'play_arrow' }}</mat-icon>
                  <span>{{ currentFeed.enabled ? 'Disable' : 'Enable' }}</span>
                </button>
                <button mat-menu-item (click)="clearArticles()" class="delete-action">
                  <mat-icon>clear_all</mat-icon>
                  <span>Clear Articles</span>
                </button>
                <button mat-menu-item (click)="deleteFeed()" class="delete-action">
                  <mat-icon>delete</mat-icon>
                  <span>Delete Feed</span>
                </button>
              </mat-menu>
            </mat-card-header>
            <mat-card-content>
              @if (currentFeed.description) {
                <p class="feed-description">{{ currentFeed.description }}</p>
              }
              <div class="feed-meta">
                <mat-chip-set>
                  <mat-chip [class]="currentFeed.enabled ? 'status-enabled' : 'status-disabled'">
                    {{ currentFeed.enabled ? 'Enabled' : 'Disabled' }}
                  </mat-chip>
                  <mat-chip>{{ currentFeed.feedType }}</mat-chip>
                  <mat-chip>
                    <mat-icon>article</mat-icon>
                    {{ currentFeed.articleCount || 0 }} articles
                  </mat-chip>
                </mat-chip-set>
              </div>
              @if (currentFeed.lastAggregated) {
                <p class="feed-last-aggregated">
                  <mat-icon>schedule</mat-icon>
                  Last updated: {{ currentFeed.lastAggregated | date: 'medium' }}
                </p>
              }
            </mat-card-content>
            <mat-card-actions>
              <button
                mat-icon-button
                class="reload-button"
                [disabled]="reloadingType() !== null || !currentFeed.enabled"
                (click)="reloadFeed(false)"
                matTooltip="Fetch new articles from the feed"
                aria-label="Fetch new articles from the feed"
                [attr.aria-busy]="reloadingType() === 'reload'"
              >
                <mat-icon [class.spinning]="reloadingType() === 'reload'">refresh</mat-icon>
              </button>
              <button
                mat-icon-button
                class="force-reload-button"
                [disabled]="reloadingType() !== null || !currentFeed.enabled"
                (click)="reloadFeed(true)"
                matTooltip="Force reload existing articles (respects daily post limit)"
                aria-label="Force reload existing articles"
                [attr.aria-busy]="reloadingType() === 'force'"
              >
                <mat-icon [class.spinning]="reloadingType() === 'force'">sync</mat-icon>
              </button>
            </mat-card-actions>
          </mat-card>

          <div class="articles-section">
            <h2>Articles</h2>
            <div class="filters">
              <mat-form-field appearance="outline" class="search-field">
                <mat-label>Search articles</mat-label>
                <input matInput [formControl]="searchControl" />
                <mat-icon matPrefix>search</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Filter</mat-label>
                <mat-select [formControl]="filterControl">
                  <mat-option [value]="null">All</mat-option>
                  <mat-option [value]="'unread'">Unread</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            @if (articleService.error()) {
              <div class="error">
                <mat-icon>error</mat-icon>
                <p>{{ articleService.error() }}</p>
                <button mat-raised-button color="primary" (click)="refreshArticles()">Retry</button>
              </div>
            }

            @if (articleService.articles().length === 0 && !articleService.loading()) {
              <div class="state-center empty-state">
                <mat-icon>article</mat-icon>
                <h3>No articles found</h3>
                <p>This feed doesn't have any articles yet.</p>
                <button mat-raised-button color="primary" routerLink="/feeds">Back to Feeds</button>
              </div>
            } @else {
              @if (articleService.loading() && articleService.articles().length === 0) {
                <div class="state-center loading" aria-live="polite" aria-busy="true">
                  <mat-spinner aria-hidden="true"></mat-spinner>
                  <p>Loading articles...</p>
                </div>
              }
              <div class="article-list">
                @for (article of articleService.articles(); track article.id) {
                  <mat-card class="article-card" [class.unread]="!article.isRead">
                    <div class="article-header">
                      @if (article.thumbnailUrl && !articleImageErrors[article.id]) {
                        <img
                          [src]="article.thumbnailUrl"
                          [alt]="article.title || article.name"
                          class="article-thumbnail"
                          loading="lazy"
                          [routerLink]="['/feeds', feed()!.id, 'articles', article.id]"
                          (error)="articleImageErrors[article.id] = true"
                        />
                      }
                      <div class="article-info">
                        <h3 [routerLink]="['/feeds', feed()!.id, 'articles', article.id]">
                          {{ article.title || article.name }}
                        </h3>
                        <div class="article-meta">
                          <span class="article-date">
                            <mat-icon>schedule</mat-icon>
                            {{ article.published || article.date | date: 'short' }}
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
                          (click)="toggleRead(article)"
                          [matTooltip]="
                            article.read || article.isRead ? 'Mark as unread' : 'Mark as read'
                          "
                          [attr.aria-label]="
                            article.read || article.isRead ? 'Mark as unread' : 'Mark as read'
                          "
                          [attr.aria-pressed]="article.read || article.isRead"
                        >
                          <mat-icon>{{
                            article.read || article.isRead
                              ? 'check_circle'
                              : 'radio_button_unchecked'
                          }}</mat-icon>
                        </button>
                        <button
                          mat-icon-button
                          [color]="article.saved || article.isSaved ? 'accent' : ''"
                          (click)="toggleSaved(article)"
                          [matTooltip]="article.saved || article.isSaved ? 'Unsave' : 'Save'"
                          [attr.aria-label]="
                            article.saved || article.isSaved ? 'Unsave article' : 'Save article'
                          "
                          [attr.aria-pressed]="article.saved || article.isSaved"
                        >
                          <mat-icon>{{
                            article.saved || article.isSaved ? 'bookmark' : 'bookmark_border'
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
                            [routerLink]="['/feeds', feed()!.id, 'articles', article.id]"
                          >
                            <mat-icon>open_in_new</mat-icon>
                            <span>View Article</span>
                          </button>
                          @if (article.link || article.url) {
                            <a mat-menu-item [href]="article.link || article.url" target="_blank">
                              <mat-icon>link</mat-icon>
                              <span>Open Original</span>
                            </a>
                          }
                          <button
                            mat-menu-item
                            (click)="deleteArticle(article)"
                            class="delete-action"
                          >
                            <mat-icon>delete</mat-icon>
                            <span>Delete</span>
                          </button>
                        </mat-menu>
                      </div>
                    </div>
                  </mat-card>
                }
              </div>

              <mat-paginator
                [length]="articleService.totalCount()"
                [pageSize]="articleService.pageSize()"
                [pageIndex]="articleService.currentPage() - 1"
                [pageSizeOptions]="[10, 20, 50, 100]"
                (page)="onPageChange($event)"
                showFirstLastButtons
              >
              </mat-paginator>
            }
          </div>
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

      .feed-header {
        margin-bottom: 24px;
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .feed-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(
          90deg,
          var(--mat-sys-primary),
          var(--mat-sys-primary-container)
        );
        opacity: 1;
      }

      .feed-header:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
      }

      .feed-header mat-card-header {
        padding: 16px 56px 16px 16px;
        display: flex;
        align-items: center;
        gap: 16px;
        background: linear-gradient(
          135deg,
          rgba(25, 118, 210, 0.02) 0%,
          rgba(25, 118, 210, 0.05) 100%
        );
        position: relative;
        flex-direction: row;
      }

      .header-menu-button {
        position: absolute;
        top: 12px;
        right: 12px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
      }

      .header-menu-button:hover {
        opacity: 1;
      }

      .feed-avatar {
        width: 56px;
        height: 56px;
        position: relative;
        flex-shrink: 0;
        order: -1;
      }

      .feed-image {
        width: 56px;
        height: 56px;
        object-fit: cover;
        border-radius: 8px;
        transition: transform 0.3s ease;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
      }

      .feed-header:hover .feed-image {
        transform: scale(1.1) rotate(5deg);
      }

      .feed-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
        transition: transform 0.3s ease;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
      }

      .feed-header:hover .feed-icon {
        transform: scale(1.1) rotate(5deg);
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
        font-size: 2rem !important;
        font-weight: 600 !important;
        margin: 0 0 8px 0 !important;
        line-height: 1.3 !important;
        letter-spacing: -0.01em;
        color: var(--mat-sys-on-surface);
      }

      mat-card-subtitle {
        font-size: 0.9375rem !important;
        opacity: 0.75;
        margin: 0 !important;
        word-break: break-all;
        font-family: 'Courier New', monospace;
        background: rgba(0, 0, 0, 0.03);
        padding: 4px 8px;
        border-radius: 4px;
        display: inline-block;
      }

      .feed-description {
        margin: 12px 0;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.9375rem;
        line-height: 1.6;
      }

      .feed-meta {
        margin: 12px 0;
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

      .feed-last-aggregated {
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(128, 128, 128, 0.9);
        font-size: 0.875rem;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
      }

      .feed-last-aggregated mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        opacity: 0.7;
      }

      mat-card-content {
        padding: 16px !important;
        background: rgba(0, 0, 0, 0.01);
      }

      mat-card-actions {
        padding: 12px 16px !important;
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        flex-wrap: wrap;
        border-top: 1px solid rgba(0, 0, 0, 0.08);
        background: rgba(0, 0, 0, 0.01);
      }

      mat-card-actions button {
        font-weight: 500;
        transition: all 0.2s ease;
        border-radius: 8px;
        padding: 0 20px;
      }

      mat-card-actions button:hover {
        background: rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
      }

      mat-card-actions button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }

      mat-card-actions button mat-icon {
        margin-right: 4px;
        font-size: 18px;
        width: 18px;
        height: 18px;
        transition: transform 0.3s ease;
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

      mat-card-actions button[mat-icon-button] {
        padding: 0;
        width: 40px;
        height: 40px;
      }

      mat-card-actions button[mat-icon-button] mat-icon {
        margin-right: 0;
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
      }

      .articles-section {
        margin-top: 32px;
      }

      .articles-section h2 {
        margin: 0 0 16px 0;
        font-size: 2rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--mat-sys-on-surface);
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

      .article-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 32px;
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
        content: '';
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

      .article-summary {
        margin: 16px 0 0 0;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.9375rem;
        line-height: 1.6;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .delete-action {
        color: #f44336 !important;
      }

      .delete-action:hover {
        background: rgba(244, 67, 54, 0.08) !important;
      }

      /* Dark mode: Improve read state visibility and card styling */
      :host-context(.dark-theme) {
        /* Darker card background */
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

        .feed-icon.article {
          color: var(--mat-sys-primary) !important;
        }

        mat-card-actions .reload-button {
          background-color: var(--mat-primary-200) !important;
        }

        mat-card-actions .reload-button:hover {
          background-color: var(--mat-sys-primary) !important;
        }

        /* Make date and meta text readable */
        .article-meta {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .article-date {
          color: rgba(255, 255, 255, 0.8) !important;
        }

        .article-summary {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .article-title {
          color: rgba(255, 255, 255, 0.95) !important;
        }

        .feed-name {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .feed-name:hover {
          color: var(--mat-sys-primary) !important;
        }

        .feed-icon.article {
          color: var(--mat-sys-primary) !important;
        }

        mat-card-actions .reload-button {
          background-color: var(--mat-primary-200) !important;
        }

        mat-card-actions .reload-button:hover {
          background-color: var(--mat-sys-primary) !important;
        }

        /* Material primary buttons use CSS variables */
      }

      mat-paginator {
        margin-top: 32px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
      }

      /* Responsive adjustments */
      @media (max-width: 600px) {
        .feed-detail-container {
          padding: 0;
        }

        .articles-section h2 {
          font-size: 1.75rem;
          padding: 0 12px;
        }

        .filters {
          flex-direction: row;
          align-items: stretch;
          padding: 16px 12px;
          width: 100%;
          box-sizing: border-box;
        }

        .search-field,
        .filter-field {
          flex: 1 1 0 !important;
          min-width: 0 !important;
          width: 0 !important;
          box-sizing: border-box;
        }

        .feed-header {
          margin: 0 0 16px 0;
          border-radius: 0;
        }

        .feed-header mat-card-header {
          padding: 16px;
        }

        .feed-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        mat-card-title {
          font-size: 1.5rem !important;
        }

        .article-card {
          padding: 14px 10px;
          border-radius: 0;
          margin: 0 0 8px 0;
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

        mat-paginator {
          margin: 16px 0 0 0;
          border-radius: 0;
        }
      }

      @media (max-width: 480px) {
        .articles-section h2 {
          font-size: 1.5rem;
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

        .feed-header mat-card-header {
          padding: 12px 8px;
          flex-direction: column;
          align-items: flex-start;
        }

        .feed-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
        }

        mat-card-title {
          font-size: 1.25rem !important;
        }

        .article-card {
          padding: 12px 8px;
        }

        .article-info h3 {
          font-size: 1.125rem;
        }
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

  feed = signal<Feed | null>(null);
  loadingFeed = signal(true);
  feedError = signal<string | null>(null);
  feedImageError = false;
  articleImageErrors: Record<number, boolean> = {};
  reloadingType = signal<'reload' | 'force' | null>(null);

  searchControl = new FormControl('');
  filterControl = new FormControl<string | null>(null);
  private destroy$ = new Subject<void>();
  hasArticleRoute = signal<boolean>(false);

  private checkArticleRoute() {
    const firstChild = this.route.snapshot.firstChild;
    this.hasArticleRoute.set(
      firstChild?.routeConfig?.path === 'articles/:articleId' ||
        firstChild?.routeConfig?.path?.includes('articles') === true
    );
  }

  ngOnInit() {
    // Check for article route initially
    this.checkArticleRoute();

    // Listen for route changes to update article route status
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.checkArticleRoute();
      });

    this.route.params
      .pipe(
        switchMap(params => {
          const feedId = Number(params['id']);
          this.loadingFeed.set(true);
          this.feedError.set(null);
          return this.feedService.getFeed(feedId).pipe(
            catchError(error => {
              this.feedError.set(error.error?.detail || error.message || 'Failed to load feed');
              this.loadingFeed.set(false);
              return of(null);
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: feed => {
          this.loadingFeed.set(false);
          if (feed) {
            this.feed.set(feed);
            // Update breadcrumb with feed name
            this.breadcrumbService.setLabel(`id:${feed.id}`, feed.name);
            this.loadArticles();

            // Check if we should trigger article fetching (from feed creation)
            const shouldFetch = this.route.snapshot.queryParams['fetch'] === 'true';
            if (shouldFetch) {
              // Remove query parameter from URL
              this.router.navigate(['/feeds', feed.id], { replaceUrl: true });
              // Trigger article fetching
              this.reloadFeed(false);
            }
          }
        },
        error: error => {
          this.feedError.set(error.error?.detail || error.message || 'Failed to load feed');
          this.loadingFeed.set(false);
        },
      });

    // Set up reactive search
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadArticles());

    this.filterControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      // Reset to page 1 when filter changes
      this.loadArticles(true);
    });

    // Auto-refresh articles every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.articleService.loading() && this.feed()) {
          this.loadArticles();
        }
      });
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

  loadArticles(resetPage: boolean = false) {
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
    if (filterValue === 'unread') {
      filters.unreadOnly = true;
    }
    // Note: 'read' and 'saved' filters are not supported by the API yet
    // They would require client-side filtering or API updates

    this.articleService.loadArticles(filters).subscribe();
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
    if (filterValue === 'unread') {
      filters.unreadOnly = true;
    }
    // Note: 'read' and 'saved' filters are not supported by the API yet
    // They would require client-side filtering or API updates

    this.articleService.loadArticles(filters).subscribe();
  }

  getFeedIcon(type: string): string {
    const icons: Record<string, string> = {
      article: 'article',
      youtube: 'play_circle',
      podcast: 'podcast',
      reddit: 'forum',
    };
    return icons[type] || 'rss_feed';
  }

  reloadFeed(force: boolean = false) {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    this.reloadingType.set(force ? 'force' : 'reload');

    this.feedService.reloadFeed(currentFeed.id, force).subscribe({
      next: response => {
        this.reloadingType.set(null);

        // Check if the operation failed (e.g., feed was disabled)
        if (!response.success) {
          // Show error message with error styling
          this.snackBar.open(response.message || 'Failed to reload feed', 'Close', {
            duration: 7000,
            panelClass: ['error-snackbar'],
          });

          // Refresh feed data to get updated disabled state
          this.feedService.getFeed(currentFeed.id).subscribe({
            next: updatedFeed => {
              this.feed.set(updatedFeed);
              // Update breadcrumb with updated feed name
              this.breadcrumbService.setLabel(`id:${updatedFeed.id}`, updatedFeed.name);
            },
          });
          this.loadArticles();
          return;
        }

        const action = force ? 'Force reloaded' : 'Reloaded';
        const articlesAdded = response.articlesAdded ?? 0;
        const articlesUpdated = response.articlesUpdated ?? 0;
        const message = force
          ? `${action} feed: ${articlesUpdated} articles updated, ${articlesAdded} new articles`
          : `${action} feed: ${articlesAdded} new articles`;

        this.snackBar.open(message, 'Close', { duration: 5000 });

        // Refresh feed data and articles
        this.feedService.getFeed(currentFeed.id).subscribe({
          next: updatedFeed => {
            this.feed.set(updatedFeed);
            // Update breadcrumb with updated feed name
            this.breadcrumbService.setLabel(`id:${updatedFeed.id}`, updatedFeed.name);
          },
        });
        this.loadArticles();
      },
      error: error => {
        this.reloadingType.set(null);
        this.snackBar.open(`Failed to reload feed: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });

        // Refresh feed data in case it was disabled
        this.feedService.getFeed(currentFeed.id).subscribe({
          next: updatedFeed => {
            this.feed.set(updatedFeed);
            // Update breadcrumb with updated feed name
            this.breadcrumbService.setLabel(`id:${updatedFeed.id}`, updatedFeed.name);
          },
        });
      },
    });
  }

  toggleEnabled() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    this.feedService.updateFeed(currentFeed.id, { enabled: !currentFeed.enabled }).subscribe({
      next: updatedFeed => {
        this.feed.set(updatedFeed);
        // Update breadcrumb with updated feed name
        this.breadcrumbService.setLabel(`id:${updatedFeed.id}`, updatedFeed.name);
        this.snackBar.open(
          `Feed ${updatedFeed.enabled ? 'enabled' : 'disabled'} successfully`,
          'Close',
          { duration: 3000 }
        );
      },
      error: error => {
        this.snackBar.open(`Failed to update feed: ${error.message}`, 'Close', { duration: 5000 });
      },
    });
  }

  clearArticles() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    const articleCount = currentFeed.articleCount || 0;
    if (articleCount === 0) {
      this.snackBar.open('This feed has no articles to clear', 'Close', { duration: 3000 });
      return;
    }

    this.confirmationService
      .confirm({
        title: 'Clear Articles',
        message: `Are you sure you want to delete all ${articleCount} article${articleCount !== 1 ? 's' : ''} from "${currentFeed.name}"? This action cannot be undone.`,
        confirmText: 'Clear All',
        cancelText: 'Cancel',
        confirmColor: 'warn',
      })
      .subscribe(confirmed => {
        if (!confirmed) return;

        this.feedService.clearFeedArticles(currentFeed.id).subscribe({
          next: response => {
            this.snackBar.open(response.message || 'Articles cleared successfully', 'Close', {
              duration: 5000,
            });
            // Refresh feed data and articles
            this.feedService.getFeed(currentFeed.id).subscribe({
              next: updatedFeed => {
                this.feed.set(updatedFeed);
                this.breadcrumbService.setLabel(`id:${updatedFeed.id}`, updatedFeed.name);
              },
            });
            this.loadArticles(true);
          },
          error: error => {
            this.snackBar.open(`Failed to clear articles: ${error.message}`, 'Close', {
              duration: 5000,
            });
          },
        });
      });
  }

  deleteFeed() {
    const currentFeed = this.feed();
    if (!currentFeed) return;

    if (
      !confirm(
        `Are you sure you want to delete "${currentFeed.name}"? This will also delete all associated articles.`
      )
    ) {
      return;
    }

    this.feedService.deleteFeed(currentFeed.id).subscribe({
      next: () => {
        this.snackBar.open(`Deleted ${currentFeed.name}`, 'Close', { duration: 3000 });
        this.router.navigate(['/feeds']);
      },
      error: error => {
        this.snackBar.open(`Failed to delete feed: ${error.message}`, 'Close', { duration: 5000 });
      },
    });
  }

  toggleRead(article: Article) {
    const currentRead = article.read || article.isRead || false;
    this.articleService.markRead(article.id, !currentRead).subscribe({
      error: error => {
        this.snackBar.open(`Failed to update article: ${error.message}`, 'Close', {
          duration: 3000,
        });
      },
    });
  }

  toggleSaved(article: Article) {
    const currentSaved = article.saved || article.isSaved || false;
    this.articleService.markSaved(article.id, !currentSaved).subscribe({
      error: error => {
        this.snackBar.open(`Failed to update article: ${error.message}`, 'Close', {
          duration: 3000,
        });
      },
    });
  }

  deleteArticle(article: Article) {
    const title = article.title || article.name || 'this article';
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    this.articleService.deleteArticle(article.id).subscribe({
      next: () => {
        this.snackBar.open(`Deleted article`, 'Close', { duration: 3000 });
      },
      error: error => {
        this.snackBar.open(`Failed to delete article: ${error.message}`, 'Close', {
          duration: 3000,
        });
      },
    });
  }
}
