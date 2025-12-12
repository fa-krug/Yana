/**
 * Feed header component - displays feed information and action buttons.
 */

import { Component, inject, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { Feed } from "../../../core/models";

@Component({
  selector: "app-feed-header",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card class="feed-header">
      <mat-card-header>
        <div class="feed-avatar">
          @if (feed().icon && !feedImageError()) {
            <img
              [src]="feed().icon"
              [alt]="feed().name"
              class="feed-image"
              loading="lazy"
              (error)="onImageError()"
            />
          }
          @if (!feed().icon || feedImageError()) {
            <mat-icon [class]="'feed-icon ' + feed().feedType">
              {{ getFeedIcon(feed().feedType) }}
            </mat-icon>
          }
        </div>
        <mat-card-title>{{ feed().name }}</mat-card-title>
        <mat-card-subtitle>{{ feed().identifier }}</mat-card-subtitle>
        <button
          mat-icon-button
          [matMenuTriggerFor]="menu"
          class="header-menu-button"
          aria-label="Feed options menu"
        >
          <mat-icon>more_vert</mat-icon>
        </button>
        <mat-menu #menu="matMenu">
          <button mat-menu-item [routerLink]="['/feeds', feed().id, 'edit']">
            <mat-icon>edit</mat-icon>
            <span>Edit Feed</span>
          </button>
          <button mat-menu-item (click)="onToggleEnabled()">
            <mat-icon>{{ feed().enabled ? "pause" : "play_arrow" }}</mat-icon>
            <span>{{ feed().enabled ? "Disable" : "Enable" }}</span>
          </button>
          <button
            mat-menu-item
            (click)="onClearArticles()"
            class="delete-action"
          >
            <mat-icon>clear_all</mat-icon>
            <span>Clear Articles</span>
          </button>
          <button mat-menu-item (click)="onDeleteFeed()" class="delete-action">
            <mat-icon>delete</mat-icon>
            <span>Delete Feed</span>
          </button>
        </mat-menu>
      </mat-card-header>
      <mat-card-content>
        @if (feed().description) {
          <p class="feed-description">{{ feed().description }}</p>
        }
        <div class="feed-meta">
          <mat-chip-set>
            <mat-chip
              [class]="feed().enabled ? 'status-enabled' : 'status-disabled'"
            >
              {{ feed().enabled ? "Enabled" : "Disabled" }}
            </mat-chip>
            <mat-chip>{{ feed().feedType }}</mat-chip>
            <mat-chip>
              <mat-icon>article</mat-icon>
              {{ feed().articleCount || 0 }} articles
            </mat-chip>
          </mat-chip-set>
        </div>
        @if (feed().lastAggregated) {
          <p class="feed-last-aggregated">
            <mat-icon>schedule</mat-icon>
            Last updated: {{ feed().lastAggregated | date: "medium" }}
          </p>
        }
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-icon-button
          class="reload-button"
          [disabled]="reloadingType() !== null || !feed().enabled"
          (click)="onReloadFeed(false)"
          matTooltip="Fetch new articles from the feed"
          aria-label="Fetch new articles from the feed"
          [attr.aria-busy]="reloadingType() === 'reload'"
        >
          <mat-icon [class.spinning]="reloadingType() === 'reload'"
            >refresh</mat-icon
          >
        </button>
        <button
          mat-icon-button
          class="force-reload-button"
          [disabled]="reloadingType() !== null || !feed().enabled"
          (click)="onReloadFeed(true)"
          matTooltip="Force reload existing articles (respects daily post limit)"
          aria-label="Force reload existing articles"
          [attr.aria-busy]="reloadingType() === 'force'"
        >
          <mat-icon [class.spinning]="reloadingType() === 'force'"
            >sync</mat-icon
          >
        </button>
        <button
          mat-icon-button
          class="mark-all-read-button"
          [disabled]="
            markingAllRead() ||
            (feed().articleCount || 0) === 0 ||
            !feed().enabled
          "
          (click)="onMarkAllAsRead()"
          matTooltip="Mark all articles as read"
          aria-label="Mark all articles as read"
          [attr.aria-busy]="markingAllRead()"
        >
          <mat-icon [class.spinning]="markingAllRead()">done_all</mat-icon>
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      .feed-header {
        margin-bottom: 24px;
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .feed-header::before {
        content: "";
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
        font-family: "Courier New", monospace;
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
        transition: transform 0.3s ease;
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

      .delete-action {
        color: #f44336 !important;
      }

      .delete-action:hover {
        background: rgba(244, 67, 54, 0.08) !important;
      }

      @media (max-width: 600px) {
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
      }

      @media (max-width: 480px) {
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
      }

      :host-context(.dark-theme) {
        .feed-icon.article {
          color: var(--mat-sys-primary) !important;
        }

        mat-card-actions .reload-button {
          background-color: var(--mat-primary-200) !important;
        }

        mat-card-actions .reload-button:hover {
          background-color: var(--mat-sys-primary) !important;
        }
      }
    `,
  ],
})
export class FeedHeaderComponent {
  private readonly snackBar = inject(MatSnackBar);

  readonly feed = input.required<Feed>();
  readonly reloadingType = input<"reload" | "force" | null>(null);
  readonly markingAllRead = input<boolean>(false);
  readonly feedImageError = input<boolean>(false);

  readonly toggleEnabled = output<void>();
  readonly clearArticles = output<void>();
  readonly deleteFeed = output<void>();
  readonly reloadFeed = output<boolean>();
  readonly markAllAsRead = output<void>();
  readonly imageError = output<void>();

  protected getFeedIcon(type: string): string {
    const icons: Record<string, string> = {
      article: "article",
      youtube: "play_circle",
      podcast: "podcast",
      reddit: "forum",
    };
    return icons[type] || "rss_feed";
  }

  protected onImageError(): void {
    this.imageError.emit();
  }

  protected onToggleEnabled(): void {
    this.toggleEnabled.emit();
  }

  protected onClearArticles(): void {
    this.clearArticles.emit();
  }

  protected onDeleteFeed(): void {
    this.deleteFeed.emit();
  }

  protected onReloadFeed(force: boolean): void {
    this.reloadFeed.emit(force);
  }

  protected onMarkAllAsRead(): void {
    this.markAllAsRead.emit();
  }
}
