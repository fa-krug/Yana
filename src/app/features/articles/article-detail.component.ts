/**
 * Article detail component - displays full article content with navigation.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Displays article content with HTML sanitization
 * - Supports YouTube video and podcast media playback
 * - Provides read/saved state management
 * - Navigation between articles (previous/next)
 * - Raw HTML content view toggle
 * - Article deletion with confirmation dialog
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
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import {
  DomSanitizer,
  SafeHtml,
  SafeResourceUrl,
} from "@angular/platform-browser";

// RxJS
import { switchMap, tap } from "rxjs";

// Angular Material
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";

// Application
import { ArticleService } from "../../core/services/article.service";
import { BreadcrumbService } from "../../core/services/breadcrumb.service";
import { ArticleActionsService } from "../../core/services/article-actions.service";
import { ArticleDetail } from "../../core/models";
import { ConfirmDialogComponent } from "../../shared/components/confirm-dialog.component";

@Component({
  selector: "app-article-detail",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatChipsModule,
    MatMenuModule,
    MatDialogModule,
  ],
  template: `
    <div class="article-detail-container container-md animate-fade-in">
      @if (loading()) {
        <div class="state-center loading" aria-live="polite" aria-busy="true">
          <mat-spinner aria-hidden="true"></mat-spinner>
          <p>Loading article...</p>
        </div>
      } @else if (error()) {
        <div class="state-center error">
          <mat-icon>error</mat-icon>
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="goBack()">
            Back
          </button>
        </div>
      } @else if (article(); as article) {
        <div class="article-toolbar">
          <div class="toolbar-left">
            @if (article.prevId) {
              <button
                mat-icon-button
                [routerLink]="getArticleRoute(article.prevId)"
                matTooltip="Previous article"
                aria-label="Previous article"
              >
                <mat-icon>navigate_before</mat-icon>
              </button>
            }
            @if (article.nextId) {
              <button
                mat-icon-button
                [routerLink]="getArticleRoute(article.nextId)"
                matTooltip="Next article"
                aria-label="Next article"
              >
                <mat-icon>navigate_next</mat-icon>
              </button>
            }
          </div>
          <div class="toolbar-right">
            <button
              mat-icon-button
              [color]="article.read ? 'primary' : ''"
              (click)="toggleRead()"
              [matTooltip]="article.read ? 'Mark as unread' : 'Mark as read'"
              [attr.aria-label]="
                article.read ? 'Mark as unread' : 'Mark as read'
              "
              [attr.aria-pressed]="article.read"
            >
              <mat-icon>{{
                article.read ? "check_circle" : "radio_button_unchecked"
              }}</mat-icon>
            </button>
            <button
              mat-icon-button
              [color]="article.saved ? 'accent' : ''"
              (click)="toggleSaved()"
              [matTooltip]="article.saved ? 'Unsave' : 'Save'"
              [attr.aria-label]="
                article.saved ? 'Unsave article' : 'Save article'
              "
              [attr.aria-pressed]="article.saved"
            >
              <mat-icon>{{
                article.saved ? "bookmark" : "bookmark_border"
              }}</mat-icon>
            </button>
            <button
              mat-icon-button
              [color]="showRawContent() ? 'primary' : ''"
              (click)="toggleRawContent()"
              [matTooltip]="
                showRawContent() ? 'Show rendered' : 'Show raw HTML'
              "
              [attr.aria-label]="
                showRawContent() ? 'Show rendered content' : 'Show raw HTML'
              "
              [attr.aria-pressed]="showRawContent()"
            >
              <mat-icon>{{ showRawContent() ? "article" : "code" }}</mat-icon>
            </button>
            <button
              mat-icon-button
              (click)="reloadArticle()"
              [disabled]="reloading()"
              matTooltip="Reload article"
              aria-label="Reload article"
              [attr.aria-busy]="reloading()"
            >
              <mat-icon [class.spinning]="reloading()">refresh</mat-icon>
            </button>
            <button
              mat-icon-button
              [matMenuTriggerFor]="menu"
              matTooltip="More"
              aria-label="More options"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu">
              @if (article.link) {
                <a mat-menu-item [href]="article.link" target="_blank">
                  <mat-icon>open_in_new</mat-icon>
                  <span>Open Original</span>
                </a>
              }
              @if (article.feed && article.feed.id) {
                <button
                  mat-menu-item
                  [routerLink]="['/feeds', article.feed.id]"
                >
                  <mat-icon>rss_feed</mat-icon>
                  <span>View Feed</span>
                </button>
              } @else if (article.feedId) {
                <button mat-menu-item [routerLink]="['/feeds', article.feedId]">
                  <mat-icon>rss_feed</mat-icon>
                  <span>View Feed</span>
                </button>
              }
              <button
                mat-menu-item
                (click)="deleteArticle()"
                class="delete-action"
              >
                <mat-icon>delete</mat-icon>
                <span>Delete</span>
              </button>
            </mat-menu>
          </div>
        </div>

        <mat-card class="article-card">
          <mat-card-header>
            <mat-card-title>
              @if (article.link) {
                <a
                  [href]="article.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="article-title-link"
                >
                  {{ article.title }}
                </a>
              } @else {
                {{ article.title }}
              }
            </mat-card-title>
            <mat-card-subtitle>
              <div class="article-meta">
                @if (article.feed && article.feed.id) {
                  <span
                    class="feed-name"
                    [routerLink]="['/feeds', article.feed.id]"
                  >
                    <mat-icon>rss_feed</mat-icon>
                    {{ article.feed.name }}
                  </span>
                } @else if (article.feedName) {
                  <span
                    class="feed-name"
                    [routerLink]="['/feeds', article.feedId]"
                  >
                    <mat-icon>rss_feed</mat-icon>
                    {{ article.feedName }}
                  </span>
                }
                <span class="article-date">
                  <mat-icon>schedule</mat-icon>
                  {{ article.published | date: "medium" }}
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
            <div class="article-tags">
              <mat-chip-set>
                @if (article.feed && article.feed.feedType) {
                  <mat-chip>{{ article.feed.feedType }}</mat-chip>
                }
                @if (article.read) {
                  <mat-chip class="status-read">Read</mat-chip>
                }
                @if (article.saved) {
                  <mat-chip class="status-saved">Saved</mat-chip>
                }
              </mat-chip-set>
            </div>

            @if (isYouTubeVideo()) {
              <div class="media-container">
                <iframe
                  [src]="getYouTubeEmbedUrl()"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                >
                </iframe>
                @if (article.duration) {
                  <p class="media-meta">
                    <mat-icon>schedule</mat-icon>
                    Duration: {{ formatDuration(article.duration) }}
                  </p>
                }
                @if (article.viewCount) {
                  <p class="media-meta">
                    <mat-icon>visibility</mat-icon>
                    Views: {{ formatNumber(article.viewCount) }}
                  </p>
                }
              </div>
            }

            @if (isPodcast()) {
              <div class="media-container">
                <audio controls [src]="article.mediaUrl || ''">
                  Your browser does not support the audio element.
                </audio>
                @if (article.duration) {
                  <p class="media-meta">
                    <mat-icon>schedule</mat-icon>
                    Duration: {{ formatDuration(article.duration) }}
                  </p>
                }
              </div>
            }

            @if (isRedditVideo()) {
              <div class="media-container">
                @if (article.mediaUrl && !article.mediaUrl.includes("/embed")) {
                  <video
                    controls
                    [src]="article.mediaUrl || ''"
                    playsinline
                    preload="metadata"
                  >
                    Your browser does not support the video element.
                  </video>
                } @else {
                  <iframe
                    [src]="getSafeRedditEmbedUrl()"
                    frameborder="0"
                    scrolling="no"
                    allowfullscreen
                  >
                  </iframe>
                }
                @if (article.duration) {
                  <p class="media-meta">
                    <mat-icon>schedule</mat-icon>
                    Duration: {{ formatDuration(article.duration) }}
                  </p>
                }
              </div>
            }

            @if (showRawContent()) {
              <div class="article-content-raw">
                <pre><code>{{ getRawContent() }}</code></pre>
              </div>
            } @else {
              <div class="article-content" [innerHTML]="getSafeContent()"></div>
            }
          </mat-card-content>
        </mat-card>

        <div class="article-navigation">
          @if (article.prevId) {
            <button
              mat-raised-button
              [routerLink]="getArticleRoute(article.prevId)"
            >
              <mat-icon>navigate_before</mat-icon>
              Previous Article
            </button>
          }
          <div class="spacer"></div>
          @if (article.nextId) {
            <button
              mat-raised-button
              [routerLink]="getArticleRoute(article.nextId)"
            >
              Next Article
              <mat-icon>navigate_next</mat-icon>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .article-detail-container {
        padding: 0;
        overflow-x: hidden;
        max-width: 100%;
        width: 100%;
      }

      .article-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 24px;
        margin: 24px auto 0 auto;
        max-width: 900px;
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        position: sticky;
        top: 16px;
        z-index: 100;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow-x: hidden;
        overflow-y: hidden;
      }

      .article-toolbar:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        background: rgba(255, 255, 255, 0.8);
      }

      .toolbar-left,
      .toolbar-right {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      .toolbar-left button,
      .toolbar-right button {
        transition: transform 0.2s ease;
      }

      .toolbar-left button:hover,
      .toolbar-right button:hover {
        transform: scale(1.1);
      }

      .article-card {
        max-width: 900px;
        margin: 24px auto;
        padding: 24px;
        width: 100%;
        box-sizing: border-box;
        cursor: default;
        position: relative;
        background: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(0, 0, 0, 0.06);
        contain: layout style paint;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 12px;
        overflow: hidden;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .article-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
        border-color: rgba(25, 118, 210, 0.2);
        background: rgba(255, 255, 255, 0.8);
      }

      .article-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        align-items: center;
        color: rgba(0, 0, 0, 0.7);
        font-size: 0.875rem;
        margin-top: 8px;
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

      .feed-name {
        color: #1976d2;
        cursor: pointer;
        text-decoration: none;
      }

      .feed-name:hover {
        text-decoration: underline;
      }

      .article-title-link {
        color: inherit;
        text-decoration: none;
        cursor: pointer;
        transition: color 0.2s ease;
      }

      .article-title-link:hover {
        color: #1976d2;
        text-decoration: underline;
      }

      .article-tags {
        margin-bottom: 24px;
      }

      .status-read {
        background-color: #1976d2 !important;
        color: white !important;
      }

      .status-saved {
        background-color: #ff6d00 !important;
        color: white !important;
      }

      .media-container {
        margin: 24px 0;
        background-color: #000;
        border-radius: 4px;
        overflow: hidden;
      }

      .media-container iframe {
        width: 100%;
        aspect-ratio: 16 / 9;
        display: block;
      }

      .media-container video {
        width: 100%;
        aspect-ratio: 16 / 9;
        display: block;
        background-color: #000;
      }

      .media-container audio {
        width: 100%;
        display: block;
        background-color: #f5f5f5;
      }

      .media-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        margin: 0;
        background-color: rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 14px;
      }

      .media-meta mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .article-content {
        margin-top: 24px;
        line-height: 1.8;
        font-size: 16px;
        color: rgba(0, 0, 0, 0.87);
        overflow: hidden;
        word-wrap: break-word;
        overflow-wrap: break-word;
        max-width: 100%;
        width: 100%;
        box-sizing: border-box;
      }

      .article-content :deep(img) {
        max-width: 100%;
        width: 100%;
        height: auto;
        display: block;
        margin: 24px auto;
        border-radius: 4px;
        box-sizing: border-box;
        object-fit: contain;
      }

      .article-content :deep(pre) {
        background-color: #f5f5f5;
        padding: 16px;
        border-radius: 4px;
        overflow-x: auto;
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .article-content :deep(code) {
        background-color: #f5f5f5;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: "Courier New", monospace;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .article-content :deep(blockquote) {
        border-left: 4px solid #1976d2;
        padding-left: 16px;
        margin: 16px 0;
        color: rgba(0, 0, 0, 0.6);
        font-style: italic;
      }

      .article-content :deep(a) {
        color: #1976d2;
        text-decoration: none;
        word-break: break-all;
      }

      .article-content :deep(a:hover) {
        text-decoration: underline;
      }

      .article-content :deep(table) {
        max-width: 100%;
        overflow-x: auto;
        display: block;
      }

      .article-content :deep(iframe),
      .article-content :deep(video),
      .article-content :deep(embed),
      .article-content :deep(object) {
        max-width: 100%;
        height: auto;
      }

      .article-content-raw {
        margin-top: 24px;
        background-color: #f5f5f5;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        overflow-x: auto;
      }

      .article-content-raw pre {
        margin: 0;
        padding: 16px;
        background-color: transparent;
        overflow-x: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: "Courier New", "Monaco", "Menlo", monospace;
        font-size: 14px;
        line-height: 1.5;
        color: rgba(0, 0, 0, 0.87);
      }

      .article-content-raw code {
        background-color: transparent;
        padding: 0;
        border-radius: 0;
        font-family: inherit;
        font-size: inherit;
        color: inherit;
      }

      .article-navigation {
        display: flex;
        justify-content: space-between;
        max-width: 900px;
        width: 100%;
        box-sizing: border-box;
        margin: 24px auto;
        padding: 0 16px 24px;
        overflow-x: hidden;
        flex-wrap: wrap;
        gap: 8px;
      }

      .article-navigation .spacer {
        flex: 1;
      }

      .delete-action {
        color: #f44336;
      }

      .spinning {
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

        /* Toolbar dark mode */
        .article-toolbar {
          background: rgba(30, 30, 30, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .article-toolbar:hover {
          background: rgba(40, 40, 40, 0.9) !important;
        }

        /* Make date and meta text readable */
        .article-meta {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .article-date {
          color: rgba(255, 255, 255, 0.8) !important;
        }

        .article-author {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .feed-name {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        .feed-name {
          color: var(--mat-sys-primary) !important;
        }

        .feed-name:hover {
          color: var(--mat-sys-primary) !important;
        }

        .article-title-link {
          color: rgba(255, 255, 255, 0.95) !important;
        }

        .article-title-link:hover {
          color: var(--mat-sys-primary) !important;
        }

        /* Improve article content text contrast */
        .article-content {
          color: rgba(255, 255, 255, 0.9) !important;
        }

        .article-content p,
        .article-content div,
        .article-content span {
          color: rgba(255, 255, 255, 0.9) !important;
        }

        .article-content a,
        .article-content :deep(a) {
          color: var(--mat-sys-primary) !important;
        }

        .article-content a:hover {
          color: var(--mat-primary-200) !important;
        }

        .article-content :deep(blockquote) {
          border-left-color: var(--mat-sys-primary) !important;
        }

        .status-read {
          background-color: var(--mat-primary-200) !important;
          color: #000000 !important;
        }

        .media-meta {
          color: rgba(255, 255, 255, 0.87) !important;
        }

        /* Material primary buttons use CSS variables */

        .article-content-raw {
          background-color: rgba(20, 20, 20, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .article-content-raw pre {
          color: rgba(255, 255, 255, 0.9) !important;
        }
      }

      /* Mobile responsive styles */
      @media (max-width: 600px) {
        .article-detail-container {
          padding: 0;
        }

        .article-toolbar {
          padding: 8px 12px;
          margin: 12px 0 0 0;
          border-radius: 0;
          flex-wrap: nowrap;
          gap: 4px;
        }

        .toolbar-left,
        .toolbar-right {
          flex-shrink: 0;
        }

        .toolbar-left button,
        .toolbar-right button {
          width: 40px;
          height: 40px;
          min-width: 40px;
          padding: 0;
        }

        .article-card {
          margin: 12px 0;
          padding: 14px 10px;
          border-radius: 0;
        }

        .article-meta {
          gap: 12px;
          font-size: 0.8rem;
        }

        .article-content {
          font-size: 15px;
          line-height: 1.7;
          margin-top: 20px;
        }

        .article-navigation {
          margin: 12px 0 16px 0;
          padding: 0;
        }

        .article-navigation button {
          flex: 1;
          min-width: 0;
          font-size: 14px;
          padding: 8px 12px;
        }

        .media-container {
          margin: 20px 0;
          border-radius: 4px;
        }

        .article-content :deep(img) {
          margin: 20px 0;
          border-radius: 4px;
          max-width: 100%;
          width: 100%;
          height: auto;
          box-sizing: border-box;
        }

        .article-content :deep(pre) {
          border-radius: 4px;
          max-width: 100%;
        }

        .article-content :deep(table) {
          width: 100%;
        }
      }

      @media (max-width: 480px) {
        .article-toolbar {
          padding: 6px 8px;
          margin: 8px 0 0 0;
          border-radius: 0;
        }

        .toolbar-left button,
        .toolbar-right button {
          width: 36px;
          height: 36px;
          min-width: 36px;
        }

        .article-card {
          margin: 8px 0;
          padding: 12px 8px;
          border-radius: 0;
        }

        .article-meta {
          gap: 8px;
          font-size: 0.75rem;
          flex-direction: column;
          align-items: flex-start;
        }

        .article-content {
          font-size: 15px;
          line-height: 1.65;
          margin-top: 16px;
        }

        .article-navigation {
          flex-direction: column;
          margin: 8px 0 12px 0;
        }

        .article-navigation .spacer {
          display: none;
        }

        .article-navigation button {
          width: 100%;
        }

        .media-container {
          margin: 16px 0;
        }

        .article-content :deep(img) {
          margin: 16px 0;
          max-width: 100%;
          width: 100%;
          height: auto;
          box-sizing: border-box;
        }

        .article-content :deep(pre) {
          max-width: 100%;
        }

        .article-content :deep(table) {
          width: 100%;
        }
      }
    `,
  ],
})
export class ArticleDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private articleService = inject(ArticleService);
  private sanitizer = inject(DomSanitizer);
  private breadcrumbService = inject(BreadcrumbService);
  private articleActions = inject(ArticleActionsService);

  article = signal<ArticleDetail | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  showRawContent = signal<boolean>(false);
  reloading = signal<boolean>(false);

  ngOnInit() {
    this.route.params
      .pipe(
        switchMap((params) => {
          // Support both route structures: /articles/:id and /feeds/:feedId/articles/:articleId
          const articleId = Number(params["articleId"] || params["id"]);
          const feedIdParam = params["feedId"] || params["id"]; // For breadcrumb key
          const articleIdParam = params["articleId"] || params["id"]; // For breadcrumb key

          this.loading.set(true);
          this.error.set(null);
          return this.articleService.getArticle(articleId).pipe(
            tap((article) => {
              // Mark as read when viewing
              if (!article.isRead && !article.read) {
                this.articleService.markRead(article.id, true).subscribe();
              }

              // Redirect to new route structure if using old route
              if (!params["feedId"] && article.feedId) {
                this.router.navigate(
                  ["/feeds", article.feedId, "articles", article.id],
                  {
                    replaceUrl: true,
                  },
                );
                return;
              }

              // Set feed context for breadcrumb if article has a feed
              // Article breadcrumb is handled automatically by BreadcrumbService
              if (article.feed?.id) {
                const feedId = article.feed.id.toString();
                this.breadcrumbService.setLabel(
                  `id:${feedId}`,
                  article.feed.name,
                );
              } else if (article.feedId) {
                const feedId = article.feedId.toString();
                if (article.feedName) {
                  this.breadcrumbService.setLabel(
                    `id:${feedId}`,
                    article.feedName,
                  );
                }
              }
            }),
          );
        }),
      )
      .subscribe({
        next: (article) => {
          this.article.set(article);
          this.loading.set(false);
          // Register actions for keyboard shortcuts
          this.registerArticleActions();
        },
        error: (error) => {
          this.error.set(error.message || "Failed to load article");
          this.loading.set(false);
        },
      });
  }

  ngOnDestroy() {
    // Unregister article actions
    this.articleActions.unregisterActions();

    // Don't clear feed breadcrumb labels here. The feed detail component will
    // set the label when it loads, and will clear it when it's destroyed.
    // This prevents the label from disappearing when clicking the feed name
    // in breadcrumbs to navigate from article detail to feed detail.
  }

  /**
   * Register article actions for keyboard shortcuts
   */
  private registerArticleActions(): void {
    this.articleActions.registerActions({
      toggleRead: () => this.toggleRead(),
      toggleSaved: () => this.toggleSaved(),
      toggleRawContent: () => this.toggleRawContent(),
      reloadArticle: () => this.reloadArticle(),
      goBack: () => this.goBack(),
      navigateToPrevious: () => {
        const article = this.article();
        if (article?.prevId) {
          this.router.navigate(this.getArticleRoute(article.prevId));
        }
      },
      navigateToNext: () => {
        const article = this.article();
        if (article?.nextId) {
          this.router.navigate(this.getArticleRoute(article.nextId));
        }
      },
      openOriginal: () => {
        const article = this.article();
        if (article?.link) {
          window.open(article.link, "_blank");
        }
      },
      viewFeed: () => {
        const article = this.article();
        if (article?.feed?.id) {
          this.router.navigate(["/feeds", article.feed.id]);
        } else if (article?.feedId) {
          this.router.navigate(["/feeds", article.feedId]);
        }
      },
    });
  }

  getArticleRoute(articleId: number): string[] {
    const currentArticle = this.article();
    const feedId = currentArticle?.feed?.id || currentArticle?.feedId;
    if (feedId) {
      return ["/feeds", feedId.toString(), "articles", articleId.toString()];
    }
    // Fallback to old route if feed not available
    return ["/articles", articleId.toString()];
  }

  getSafeContent(): SafeHtml {
    const content = this.article()?.content || "";
    // Add lazy loading to all images in content
    const contentWithLazyImages = content.replace(
      /<img([^>]*?)>/gi,
      (match, attributes) => {
        // Check if loading attribute already exists
        if (/loading\s*=/i.test(attributes)) {
          return match; // Already has loading attribute
        }
        // Add loading="lazy" if not present
        return `<img${attributes} loading="lazy">`;
      },
    );
    return this.sanitizer.sanitize(1, contentWithLazyImages) || "";
  }

  getRawContent(): string {
    return this.article()?.content || "";
  }

  toggleRawContent() {
    this.showRawContent.update((value) => !value);
  }

  isYouTubeVideo(): boolean {
    const currentArticle = this.article();
    if (!currentArticle) return false;
    const feedType =
      currentArticle.feed?.feedType || (currentArticle.feedId ? "" : "");
    return feedType === "youtube" && !!currentArticle.mediaUrl;
  }

  isPodcast(): boolean {
    const currentArticle = this.article();
    if (!currentArticle) return false;
    const feedType =
      currentArticle.feed?.feedType || (currentArticle.feedId ? "" : "");
    return feedType === "podcast" && !!currentArticle.mediaUrl;
  }

  isRedditVideo(): boolean {
    const currentArticle = this.article();
    if (!currentArticle) return false;
    const feedType =
      currentArticle.feed?.feedType || (currentArticle.feedId ? "" : "");
    // Check if it's a Reddit feed with a video URL (HLS or embed)
    return (
      feedType === "reddit" &&
      !!currentArticle.mediaUrl &&
      (currentArticle.mediaUrl.includes("v.redd.it") ||
        currentArticle.mediaUrl.includes("HLSPlaylist.m3u8") ||
        currentArticle.mediaUrl.includes("/embed"))
    );
  }

  getYouTubeEmbedUrl(): SafeResourceUrl {
    const article = this.article();
    if (!article?.mediaUrl) return "";

    // Check if mediaUrl is already a proxy URL - use it directly
    if (article.mediaUrl.includes("/api/youtube-proxy")) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(article.mediaUrl);
    }

    // Extract video ID from standard YouTube URLs
    const videoIdMatch = article.mediaUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
    );
    if (!videoIdMatch) return "";

    const videoId = videoIdMatch[1];
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${videoId}`,
    );
  }

  getSafeRedditEmbedUrl(): SafeResourceUrl {
    const article = this.article();
    if (!article?.mediaUrl) return "";

    // Return the embed URL as-is (it's already in the correct format from backend)
    return this.sanitizer.bypassSecurityTrustResourceUrl(article.mediaUrl);
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  formatNumber(num: number): string {
    return num.toLocaleString();
  }

  toggleRead() {
    const article = this.article();
    if (!article) return;

    const currentRead = article.read ?? article.isRead ?? false;
    this.articleService.markRead(article.id, !currentRead).subscribe({
      next: () => {
        this.article.set({
          ...article,
          read: !currentRead,
          isRead: !currentRead,
        });
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

  toggleSaved() {
    const article = this.article();
    if (!article) return;

    const currentSaved = article.saved ?? article.isSaved ?? false;
    this.articleService.markSaved(article.id, !currentSaved).subscribe({
      next: () => {
        this.article.set({
          ...article,
          saved: !currentSaved,
          isSaved: !currentSaved,
        });
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

  deleteArticle() {
    const article = this.article();
    if (!article) return;

    const title = article.title || article.name || "this article";
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Delete Article",
        message: `Are you sure you want to delete "${title}"?`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmColor: "warn",
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.articleService.deleteArticle(article.id).subscribe({
          next: () => {
            this.snackBar.open("Article deleted", "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.goBack();
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
    });
  }

  goBack() {
    const article = this.article();
    if (article?.feed?.id) {
      this.router.navigate(["/feeds", article.feed.id]);
    } else if (article?.feedId) {
      this.router.navigate(["/feeds", article.feedId]);
    } else {
      this.router.navigate(["/"]);
    }
  }

  reloadArticle() {
    const article = this.article();
    if (!article) return;

    this.reloading.set(true);
    this.articleService.refreshArticle(article.id).subscribe({
      next: (response) => {
        if (response.success && response.taskId) {
          // Poll for task completion
          this.articleService.pollTaskStatus(response.taskId).subscribe({
            next: (taskResult) => {
              if (taskResult.status === "completed") {
                // Task completed, fetch the updated article
                this.articleService.getArticle(article.id).subscribe({
                  next: (refreshedArticle) => {
                    this.article.set(refreshedArticle);
                    this.reloading.set(false);
                    this.snackBar.open(
                      "Article reloaded successfully",
                      "Close",
                      {
                        duration: 2000,
                        panelClass: ["success-snackbar"],
                      },
                    );
                  },
                  error: (error) => {
                    this.reloading.set(false);
                    this.snackBar.open(
                      `Failed to fetch reloaded article: ${error.message || "Unknown error"}`,
                      "Close",
                      { duration: 3000 },
                    );
                  },
                });
              } else if (taskResult.status === "failed") {
                // Task failed
                this.reloading.set(false);
                this.snackBar.open(
                  `Article reload failed: ${taskResult.error || "Unknown error"}`,
                  "Close",
                  { duration: 3000 },
                );
              }
            },
            error: (error) => {
              this.reloading.set(false);
              this.snackBar.open(
                `Failed to check reload status: ${error.message || "Unknown error"}`,
                "Close",
                { duration: 3000 },
              );
            },
          });
        } else {
          this.reloading.set(false);
          this.snackBar.open("Failed to start article refresh", "Close", {
            duration: 3000,
          });
        }
      },
      error: (error) => {
        this.reloading.set(false);
        this.snackBar.open(
          `Failed to refresh article: ${error.message || "Unknown error"}`,
          "Close",
          { duration: 3000 },
        );
      },
    });
  }
}
