/**
 * Feed articles list component - displays articles for a feed with filters and pagination.
 */

import { Component, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ArticleService } from "@app/core/services/article.service";
import { Article } from "@app/core/models";
import {
  getProxiedImageUrl,
  getResponsiveImageSrcset,
  getImageSizes,
} from "@app/core/utils/image-proxy.util";
import { PrefetchOnIntersectDirective } from "@app/core/directives/prefetch-on-intersect.directive";

@Component({
  selector: "app-feed-articles-list",
  standalone: true,
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
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatMenuModule,
    MatTooltipModule,
    PrefetchOnIntersectDirective,
  ],
  template: `
    <div class="articles-section">
      <h2>Articles</h2>
      <div class="filters">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search articles</mat-label>
          <input matInput [formControl]="searchControl()" />
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Filter</mat-label>
          <mat-select [formControl]="filterControl()">
            <mat-option [value]="null">All</mat-option>
            <mat-option [value]="'unread'">Unread</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (articleService().error()) {
        <div class="error">
          <mat-icon>error</mat-icon>
          <p>{{ articleService().error() }}</p>
          <button mat-raised-button color="primary" (click)="onRefresh()">
            Retry
          </button>
        </div>
      }

      @if (
        articleService().articles().length === 0 && !articleService().loading()
      ) {
        <div class="state-center empty-state">
          <mat-icon>article</mat-icon>
          <h3>No articles found</h3>
          <p>This feed doesn't have any articles yet.</p>
          <button mat-raised-button color="primary" routerLink="/feeds">
            Back to Feeds
          </button>
        </div>
      } @else {
        @if (
          articleService().loading() && articleService().articles().length === 0
        ) {
          <div class="state-center loading" aria-live="polite" aria-busy="true">
            <mat-spinner aria-hidden="true"></mat-spinner>
            <p>Loading articles...</p>
          </div>
        }
        <div class="article-list">
          @for (article of articleService().articles(); track article.id) {
            <mat-card
              class="article-card"
              [class.unread]="!article.isRead"
              appPrefetchOnIntersect
              [articleId]="article.id"
            >
              <div class="article-header">
                @if (
                  article.thumbnailUrl && !articleImageErrors()[article.id]
                ) {
                  <img
                    [src]="getProxiedImageUrl(article.thumbnailUrl)"
                    [srcset]="getResponsiveImageSrcset(article.thumbnailUrl)"
                    [sizes]="getImageSizes('120px')"
                    [alt]="article.title || article.name"
                    class="article-thumbnail"
                    loading="lazy"
                    [routerLink]="['/feeds', feedId(), 'articles', article.id]"
                    (error)="onArticleImageError(article.id)"
                  />
                }
                <div class="article-info">
                  <h3
                    [routerLink]="['/feeds', feedId(), 'articles', article.id]"
                  >
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
                    (click)="onToggleRead(article)"
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
                    (click)="onToggleSaved(article)"
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
                      [routerLink]="[
                        '/feeds',
                        feedId(),
                        'articles',
                        article.id,
                      ]"
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
                    <button
                      mat-menu-item
                      (click)="onDeleteArticle(article)"
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
          [length]="articleService().totalCount()"
          [pageSize]="articleService().pageSize()"
          [pageIndex]="articleService().currentPage() - 1"
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

      .error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        gap: 16px;
      }

      .error mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #f44336;
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

      .delete-action {
        color: #f44336 !important;
      }

      .delete-action:hover {
        background: rgba(244, 67, 54, 0.08) !important;
      }

      mat-paginator {
        margin-top: 32px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
      }

      @media (max-width: 600px) {
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

        .article-card {
          padding: 12px 8px;
        }

        .article-info h3 {
          font-size: 1.125rem;
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
export class FeedArticlesListComponent {
  readonly feedId = input.required<number>();
  readonly articleService = input.required<ArticleService>();
  readonly searchControl = input.required<FormControl<string | null>>();
  readonly filterControl = input.required<FormControl<string | null>>();

  readonly refreshArticles = output<void>();
  readonly pageChange = output<PageEvent>();
  readonly toggleRead = output<Article>();
  readonly toggleSaved = output<Article>();
  readonly deleteArticle = output<Article>();

  private readonly articleImageErrorsSignal = signal<Record<number, boolean>>(
    {},
  );
  protected readonly articleImageErrors =
    this.articleImageErrorsSignal.asReadonly();

  protected readonly getProxiedImageUrl = getProxiedImageUrl;
  protected readonly getResponsiveImageSrcset = getResponsiveImageSrcset;
  protected readonly getImageSizes = getImageSizes;

  protected onArticleImageError(articleId: number): void {
    const errors = { ...this.articleImageErrorsSignal() };
    errors[articleId] = true;
    this.articleImageErrorsSignal.set(errors);
  }

  protected onRefresh(): void {
    this.refreshArticles.emit();
  }

  protected onPageChange(event: PageEvent): void {
    this.pageChange.emit(event);
  }

  protected onToggleRead(article: Article): void {
    this.toggleRead.emit(article);
  }

  protected onToggleSaved(article: Article): void {
    this.toggleSaved.emit(article);
  }

  protected onDeleteArticle(article: Article): void {
    this.deleteArticle.emit(article);
  }
}
