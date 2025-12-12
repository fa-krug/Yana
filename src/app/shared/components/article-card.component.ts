/**
 * Shared article card component - displays article in grid/list layout.
 */

import { Component, inject, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Article } from "@app/core/models";
import { getProxiedImageUrl } from "@app/core/utils/image-proxy.util";

@Component({
  selector: "app-article-card",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  template: `
    <mat-card class="article-card card-elevated" [routerLink]="articleRoute()">
      <mat-card-header>
        <mat-card-title>{{ article().title || article().name }}</mat-card-title>
        <mat-card-subtitle>
          <div class="article-meta">
            <span class="article-date">
              <mat-icon>schedule</mat-icon>
              {{ article().published | date: "short" }}
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
        @if (article().thumbnailUrl) {
          <img
            [src]="getProxiedImageUrl(article().thumbnailUrl)"
            [alt]="article().title || article().name"
            class="article-thumbnail"
            loading="lazy"
          />
        }
        <div class="article-tags">
          <mat-chip-set>
            @if (article().read || article().isRead) {
              <mat-chip class="status-read">Read</mat-chip>
            }
            @if (article().saved || article().isSaved) {
              <mat-chip class="status-saved">Saved</mat-chip>
            }
            @if (article().isVideo) {
              <mat-chip>Video</mat-chip>
            }
            @if (article().isPodcast) {
              <mat-chip>Podcast</mat-chip>
            }
            @if (article().isReddit) {
              <mat-chip>Reddit</mat-chip>
            }
          </mat-chip-set>
        </div>
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-button
          [color]="article().read || article().isRead ? 'primary' : ''"
          (click)="onToggleRead($event)"
          [matTooltip]="
            article().read || article().isRead
              ? 'Mark as unread'
              : 'Mark as read'
          "
        >
          <mat-icon>{{
            article().read || article().isRead
              ? "check_circle"
              : "radio_button_unchecked"
          }}</mat-icon>
          {{ article().read || article().isRead ? "Read" : "Unread" }}
        </button>
        <button
          mat-button
          [color]="article().saved || article().isSaved ? 'accent' : ''"
          (click)="onToggleSaved($event)"
          [matTooltip]="
            article().saved || article().isSaved ? 'Unsave' : 'Save'
          "
        >
          <mat-icon>{{
            article().saved || article().isSaved
              ? "bookmark"
              : "bookmark_border"
          }}</mat-icon>
          {{ article().saved || article().isSaved ? "Saved" : "Save" }}
        </button>
        <div class="spacer"></div>
        @if (article().link) {
          <a
            mat-icon-button
            [href]="article().link"
            target="_blank"
            (click)="$event.stopPropagation()"
            matTooltip="Open original"
          >
            <mat-icon>open_in_new</mat-icon>
          </a>
        }
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
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

      @media (max-width: 600px) {
        .article-card {
          border-radius: 0;
          margin: 0;
        }
      }
    `,
  ],
})
export class ArticleCardComponent {
  readonly article = input.required<Article>();
  readonly articleRoute = input.required<string[]>();

  readonly toggleRead = output<{ event: Event; article: Article }>();
  readonly toggleSaved = output<{ event: Event; article: Article }>();

  protected readonly getProxiedImageUrl = getProxiedImageUrl;

  protected onToggleRead(event: Event): void {
    this.toggleRead.emit({ event, article: this.article() });
  }

  protected onToggleSaved(event: Event): void {
    this.toggleSaved.emit({ event, article: this.article() });
  }
}
