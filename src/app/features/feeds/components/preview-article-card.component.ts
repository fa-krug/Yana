/**
 * Preview article card component - displays article in feed preview step.
 */

import { CommonModule } from "@angular/common";
import { Component, inject, input } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

import { PreviewArticle } from "@app/core/models";

@Component({
  selector: "app-preview-article-card",
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="preview-article-card">
      <mat-card-header>
        @if (article().thumbnailUrl) {
          <img
            mat-card-avatar
            [src]="article().thumbnailUrl"
            [alt]="article().title"
          />
        }
        <mat-card-title>{{ article().title }}</mat-card-title>
        @if (article().author) {
          <mat-card-subtitle>by {{ article().author }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (isYouTubeVideo()) {
          <div class="media-container">
            <iframe
              [src]="getYouTubeEmbedUrl()"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            >
            </iframe>
          </div>
        }

        @if (article().content) {
          <div class="article-content">
            <h5>Content</h5>
            <div [innerHTML]="getSafeContent()"></div>
          </div>
        }

        @if (article().link) {
          <div class="article-link">
            <mat-icon>link</mat-icon>
            <a
              [href]="article().link"
              target="_blank"
              rel="noopener noreferrer"
              >{{ article().link }}</a
            >
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .preview-article-card {
        margin-bottom: 24px;
      }

      .media-container {
        margin: 16px 0;
        background-color: #000;
        border-radius: 4px;
        overflow: hidden;
      }

      .media-container iframe {
        width: 100%;
        aspect-ratio: 16 / 9;
        display: block;
      }

      .article-summary,
      .article-content {
        margin: 16px 0;
      }

      .article-summary h5,
      .article-content h5 {
        margin: 0 0 8px 0;
        font-size: 1rem;
        font-weight: 500;
      }

      .article-content {
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        padding: 12px;
      }

      .article-content :deep(img) {
        max-width: 100%;
        height: auto;
      }

      .article-link {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
        padding: 12px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 4px;
      }

      .article-link mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .article-link a {
        color: var(--mat-sys-primary);
        text-decoration: none;
        word-break: break-all;
      }

      .article-link a:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class PreviewArticleCardComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly article = input.required<PreviewArticle>();

  protected isYouTubeVideo(): boolean {
    const currentArticle = this.article();
    return (
      !!currentArticle?.link &&
      (currentArticle.link.includes("youtube.com") ||
        currentArticle.link.includes("youtu.be"))
    );
  }

  protected getYouTubeEmbedUrl(): SafeResourceUrl {
    const article = this.article();
    if (!article?.link) return "";

    const videoIdMatch =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/.exec(
        article.link,
      );
    if (!videoIdMatch) return "";

    const videoId = videoIdMatch[1];
    // Safe: YouTube embed URLs are trusted sources from parsed HTML content
    // eslint-disable-next-line sonarjs/no-angular-bypass-sanitization
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${videoId}`,
    );
  }

  protected getSafeContent(): string {
    const content = this.article()?.content || "";
    return content;
  }
}
