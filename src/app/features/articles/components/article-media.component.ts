/**
 * Article media component - handles YouTube, Podcast, and Reddit media rendering.
 */

import { Component, inject, input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { MatIconModule } from "@angular/material/icon";
import { ArticleDetail } from "@app/core/models";

@Component({
  selector: "app-article-media",
  standalone: true,
  imports: [CommonModule, MatIconModule],
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
      <div class="media-container">
        @if (article().mediaUrl && !article().mediaUrl?.includes("/embed")) {
          <video
            controls
            [src]="article().mediaUrl || ''"
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

  protected getSafeRedditEmbedUrl(): SafeResourceUrl {
    const article = this.article();
    if (!article?.mediaUrl) return "";
    return this.sanitizer.bypassSecurityTrustResourceUrl(article.mediaUrl);
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
