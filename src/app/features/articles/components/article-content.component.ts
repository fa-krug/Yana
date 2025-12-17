/**
 * Article content component - displays article content with HTML sanitization.
 */

import {
  Component,
  inject,
  input,
  output,
  signal,
  effect,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { FormsModule } from "@angular/forms";
import { ArticleDetail } from "@app/core/models";
import { ArticleMediaComponent } from "./article-media.component";
import { ArticleService } from "@app/core/services/article.service";

@Component({
  selector: "app-article-content",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ArticleMediaComponent,
  ],
  template: `
    <mat-card class="article-card">
      <mat-card-header>
        <mat-card-title>
          @if (article().link) {
            <a
              [href]="article().link"
              target="_blank"
              rel="noopener noreferrer"
              class="article-title-link"
            >
              {{ article().title }}
            </a>
          } @else {
            {{ article().title }}
          }
        </mat-card-title>
        <mat-card-subtitle>
          <div class="article-meta">
            @if (article().feed?.id) {
              <span
                class="feed-name"
                [routerLink]="['/feeds', article().feed!.id]"
              >
                <mat-icon>rss_feed</mat-icon>
                {{ article().feed!.name }}
              </span>
            } @else if (article().feedName) {
              <span
                class="feed-name"
                [routerLink]="['/feeds', article().feedId]"
              >
                <mat-icon>rss_feed</mat-icon>
                {{ article().feedName }}
              </span>
            }
            <span class="article-date">
              <mat-icon>schedule</mat-icon>
              {{ article().published | date: "medium" }}
            </span>
            @if (article().author) {
              <span class="article-author">
                <mat-icon>person</mat-icon>
                {{ article().author }}
              </span>
            }
          </div>
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div class="article-tags">
          <mat-chip-set>
            @if (article().feed?.feedType) {
              <mat-chip>{{ article().feed!.feedType }}</mat-chip>
            }
            @if (article().read) {
              <mat-chip class="status-read">Read</mat-chip>
            }
            @if (article().saved) {
              <mat-chip class="status-saved">Saved</mat-chip>
            }
          </mat-chip-set>
        </div>

        <app-article-media [article]="article()" />

        @if (showRawContent()) {
          <div class="article-content-raw">
            <textarea
              class="raw-content-input"
              [(ngModel)]="editedContent"
              [disabled]="saving()"
            ></textarea>
          </div>
        } @else {
          <div class="article-content" [innerHTML]="getSafeContent()"></div>
        }
      </mat-card-content>

      @if (showRawContent()) {
        <mat-card-actions align="end">
          <button
            mat-raised-button
            color="primary"
            (click)="onSave()"
            [disabled]="saving() || editedContent() === getRawContent()"
            class="save-button"
          >
            @if (saving()) {
              <mat-spinner diameter="20" class="inline-spinner"></mat-spinner>
            }
            Save
          </button>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: [
    `
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

      .article-content :deep(.youtube-embed-container) {
        position: relative;
        width: 100%;
        max-width: 100%;
        margin: 24px 0;
        padding-bottom: 56.25%;
        height: 0;
        overflow: hidden;
        box-sizing: border-box;
      }

      .article-content :deep(.youtube-embed-container iframe) {
        position: absolute;
        top: 0;
        left: 0;
        width: 100% !important;
        height: 100% !important;
        max-width: 100%;
        border: 0;
        box-sizing: border-box;
      }

      .article-content-raw {
        margin-top: 24px;
        background-color: #f5f5f5;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      mat-card-actions {
        padding: 16px 24px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .save-button {
        display: flex;
        align-items: center;
        gap: 8px;
        background-color: #2196f3 !important;
        color: white !important;
      }

      .save-button:hover:not(:disabled) {
        background-color: #1976d2 !important;
      }

      .save-button:disabled {
        opacity: 0.6;
      }

      .inline-spinner {
        display: inline-block;
        margin: 0;
      }

      .raw-content-input {
        flex: 1;
        margin: 0;
        padding: 16px;
        background-color: transparent;
        border: none;
        outline: none;
        resize: vertical;
        overflow-x: auto;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: "Courier New", "Monaco", "Menlo", monospace;
        font-size: 14px;
        line-height: 1.5;
        color: rgba(0, 0, 0, 0.87);
        min-height: 300px;
        width: 100%;
        box-sizing: border-box;
      }

      .raw-content-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      @media (max-width: 600px) {
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

      :host-context(.dark-theme) {
        .article-card {
          background: rgba(30, 30, 30, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .article-card:hover {
          background: rgba(40, 40, 40, 0.9) !important;
        }

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

        .article-content-raw {
          background-color: rgba(20, 20, 20, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        .raw-content-input {
          color: rgba(255, 255, 255, 0.9) !important;
        }
      }
    `,
  ],
})
export class ArticleContentComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly articleService = inject(ArticleService);
  private readonly snackBar = inject(MatSnackBar);

  readonly article = input.required<ArticleDetail>();
  readonly showRawContent = input.required<boolean>();

  readonly articleUpdated = output<ArticleDetail>();

  readonly editedContent = signal<string>("");
  readonly saving = signal<boolean>(false);

  constructor() {
    // Update editedContent when article changes
    effect(() => {
      const content = this.getRawContent();
      this.editedContent.set(content);
    });
  }

  protected onSave(): void {
    const articleId = this.article()?.id;
    if (!articleId) {
      return;
    }

    const content = this.editedContent();
    if (content === this.getRawContent()) {
      return;
    }

    this.saving.set(true);
    this.articleService.updateArticle(articleId, { content }).subscribe({
      next: (updatedArticle) => {
        this.saving.set(false);
        this.snackBar.open("Article content saved", "Close", {
          duration: 3000,
          panelClass: ["success-snackbar"],
        });
        // Notify parent component to update the article
        this.articleUpdated.emit(updatedArticle);
      },
      error: (error) => {
        this.saving.set(false);
        this.snackBar.open(
          `Failed to save article: ${error.message || "Unknown error"}`,
          "Close",
          {
            duration: 5000,
          },
        );
      },
    });
  }

  protected getSafeContent(): SafeHtml {
    const content = this.article()?.content || "";
    const contentWithLazyImages = content.replace(
      /<img([^>]*?)>/gi,
      (match, attributes) => {
        if (/loading\s*=/i.test(attributes)) {
          return match;
        }
        return `<img${attributes} loading="lazy">`;
      },
    );

    if (contentWithLazyImages.includes("youtube-embed-container")) {
      return this.sanitizer.bypassSecurityTrustHtml(contentWithLazyImages);
    }

    return this.sanitizer.sanitize(1, contentWithLazyImages) || "";
  }

  protected getRawContent(): string {
    return this.article()?.content || "";
  }
}
