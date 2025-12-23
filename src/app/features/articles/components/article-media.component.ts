/**
 * Article media component - handles YouTube, Podcast, and Reddit media rendering.
 */

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { MatIconModule } from "@angular/material/icon";
import { ArticleDetail } from "@app/core/models";

@Component({
  selector: "app-article-media",
  imports: [CommonModule, MatIconModule, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isYouTubeVideo()) {
      <div class="media-container">
        <iframe
          [src]="getYouTubeEmbedUrl()"
          frameborder="0"
          style="width: 100%"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        >
        </iframe>
        @if (article().duration) {
          <p class="media-meta">
            <mat-icon>schedule</mat-icon>
            @if (article().duration) {
              Duration: {{ formatDuration(article().duration!) }}
            }
          </p>
        }
        @if (article().viewCount) {
          <p class="media-meta">
            <mat-icon>visibility</mat-icon>
            @if (article().viewCount) {
              Views: {{ formatNumber(article().viewCount!) }}
            }
          </p>
        }
      </div>
    }

    @if (isPodcast()) {
      <div class="media-container">
        <audio controls [src]="article().mediaUrl || ''">
          Your browser does not support the audio element.
        </audio>
        @if (article().duration) {
          <p class="media-meta">
            <mat-icon>schedule</mat-icon>
            @if (article().duration) {
              Duration: {{ formatDuration(article().duration!) }}
            }
          </p>
        }
      </div>
    }

    @if (isRedditVideo()) {
      <div class="media-container reddit-fallback">
        @if (article().thumbnailUrl) {
          <img
            [ngSrc]="article().thumbnailUrl!"
            width="640"
            height="360"
            alt="Reddit video preview for {{ article().name }}"
            loading="lazy"
          />
        } @else {
          <div class="media-placeholder">Reddit video preview unavailable</div>
        }
        @if (getRedditLink()) {
          <a
            class="reddit-link"
            [href]="getRedditLink()"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on Reddit
          </a>
        } @else {
          <p class="reddit-link muted">Reddit link unavailable</p>
        }
        @if (article().duration) {
          <p class="media-meta">
            <mat-icon>schedule</mat-icon>
            @if (article().duration) {
              Duration: {{ formatDuration(article().duration!) }}
            }
          </p>
        }
      </div>
    }
  `,
  styles: [
    `
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

      .reddit-fallback {
        background-color: #0a0a0a;
      }

      .reddit-fallback img {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 16 / 9;
        object-fit: cover;
      }

      .media-placeholder {
        padding: 32px 16px;
        text-align: center;
        color: rgba(255, 255, 255, 0.72);
      }

      .reddit-link {
        display: block;
        padding: 12px 16px;
        color: #ff4500;
        text-decoration: none;
        font-weight: 600;
        background-color: rgba(255, 255, 255, 0.08);
      }

      .reddit-link:hover,
      .reddit-link:focus {
        text-decoration: underline;
      }

      .reddit-link.muted {
        color: rgba(255, 255, 255, 0.72);
        cursor: default;
      }

      .reddit-link:focus {
        outline: 2px solid #ff4500;
        outline-offset: 2px;
      }

      :host-context(.dark-theme) {
        .media-meta {
          color: rgba(255, 255, 255, 0.87) !important;
        }
      }
    `,
  ],
})
export class ArticleMediaComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly article = input.required<ArticleDetail>();

  protected isYouTubeVideo(): boolean {
    const currentArticle = this.article();
    if (!currentArticle) return false;
    const feedType =
      currentArticle.feed?.feedType || (currentArticle.feedId ? "" : "");
    return feedType === "youtube" && !!currentArticle.mediaUrl;
  }

  protected isPodcast(): boolean {
    const currentArticle = this.article();
    if (!currentArticle) return false;
    const feedType =
      currentArticle.feed?.feedType || (currentArticle.feedId ? "" : "");
    return feedType === "podcast" && !!currentArticle.mediaUrl;
  }

  protected isRedditVideo(): boolean {
    const currentArticle = this.article();
    if (!currentArticle) return false;
    const feedType =
      currentArticle.feed?.feedType || (currentArticle.feedId ? "" : "");
    return (
      feedType === "reddit" &&
      !!currentArticle.mediaUrl &&
      (currentArticle.mediaUrl.includes("v.redd.it") ||
        currentArticle.mediaUrl.includes("HLSPlaylist.m3u8") ||
        currentArticle.mediaUrl.includes("vxreddit.com") ||
        currentArticle.mediaUrl.includes("/embed"))
    );
  }

  protected getYouTubeEmbedUrl(): SafeResourceUrl {
    const article = this.article();
    if (!article?.mediaUrl) return "";

    if (article.mediaUrl.includes("/api/youtube-proxy")) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(article.mediaUrl);
    }

    const videoIdMatch = article.mediaUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
    );
    if (!videoIdMatch) return "";

    const videoId = videoIdMatch[1];
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${videoId}`,
    );
  }

  protected getRedditLink(): string {
    const article = this.article();
    if (!article) return "";
    return article.url || article.link || article.mediaUrl || "";
  }

  protected formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  protected formatNumber(num: number): string {
    return num.toLocaleString();
  }
}
