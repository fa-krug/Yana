/**
 * Feed card component - displays individual feed in grid layout.
 */

import { Component, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Feed } from "@app/core/models";

@Component({
  selector: "app-feed-card",
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
  ],
  template: `
    <mat-card class="feed-card card-elevated card-gradient-bar">
      <mat-card-header>
        <div class="feed-avatar">
          @if (feed().icon && !imageError()) {
            <img
              [src]="feed().icon"
              [alt]="feed().name"
              class="feed-image"
              loading="lazy"
              (error)="onImageError()"
            />
          }
          @if (!feed().icon || imageError()) {
            <mat-icon [class]="'feed-icon ' + feed().feedType">
              {{ getFeedIcon(feed().feedType) }}
            </mat-icon>
          }
        </div>
        <div class="feed-header-content">
          <mat-card-title
            [routerLink]="['/feeds', feed().id]"
            class="feed-title-link"
            >{{ feed().name }}</mat-card-title
          >
          <mat-card-subtitle>{{ feed().identifier }}</mat-card-subtitle>
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
          <button mat-menu-item [routerLink]="['/feeds', feed().id]">
            <mat-icon>visibility</mat-icon>
            <span>View Details</span>
          </button>
          <button mat-menu-item [routerLink]="['/feeds', feed().id, 'edit']">
            <mat-icon>edit</mat-icon>
            <span>Edit</span>
          </button>
          <button mat-menu-item (click)="onToggleEnabled()">
            <mat-icon>{{ feed().enabled ? "pause" : "play_arrow" }}</mat-icon>
            <span>{{ feed().enabled ? "Disable" : "Enable" }}</span>
          </button>
          <button mat-menu-item (click)="onDeleteFeed()" class="delete-action">
            <mat-icon>delete</mat-icon>
            <span>Delete</span>
          </button>
        </mat-menu>
      </mat-card-header>
      <mat-card-content>
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
            @if (feed().groups?.length) {
              @for (group of feed().groups; track group.id) {
                <mat-chip class="group-chip">
                  <mat-icon>folder</mat-icon>
                  {{ group.name }}
                </mat-chip>
              }
            }
          </mat-chip-set>
        </div>
        @if (feed().description) {
          <p class="feed-description">{{ feed().description }}</p>
        }
        @if (feed().lastAggregated) {
          <p class="feed-last-aggregated">
            <mat-icon>schedule</mat-icon>
            Last updated: {{ feed().lastAggregated | date: "short" }}
          </p>
        }
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-icon-button
          class="reload-button"
          [disabled]="reloadingType() !== null || !feed().enabled"
          (click)="onReloadFeed(false)"
          matTooltip="Fetch new articles"
          aria-label="Fetch new articles"
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
          matTooltip="Force reload existing articles (respects daily limit)"
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
        gap: 16px;
      }

      .feed-header-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
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
        width: 56px;
        height: 56px;
        position: relative;
        flex-shrink: 0;
      }

      .feed-image {
        width: 56px;
        height: 56px;
        object-fit: cover;
        border-radius: 12px;
        transition: transform 0.3s ease;
        display: block;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .feed-card:hover .feed-image {
        transform: scale(1.05);
      }

      .feed-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
        transition: transform 0.3s ease;
      }

      .feed-card:hover .feed-icon {
        transform: scale(1.05);
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

      @media (max-width: 600px) {
        .feed-card {
          border-radius: 0;
          margin: 0;
        }

        .feed-card mat-card-header {
          padding: 12px 10px 8px 10px;
          gap: 12px;
        }

        .feed-avatar {
          width: 48px;
          height: 48px;
        }

        .feed-image {
          width: 48px;
          height: 48px;
        }

        .feed-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        mat-card-actions {
          flex-wrap: wrap;
          padding: 8px 10px;
        }
      }

      @media (max-width: 480px) {
        .feed-card mat-card-header {
          padding: 10px 8px 6px 8px;
          gap: 10px;
        }

        .feed-avatar {
          width: 40px;
          height: 40px;
        }

        .feed-image {
          width: 40px;
          height: 40px;
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
export class FeedCardComponent {
  readonly feed = input.required<Feed>();
  readonly reloadingType = input<"reload" | "force" | null>(null);
  readonly markingAllRead = input<boolean>(false);

  readonly toggleEnabled = output<Feed>();
  readonly deleteFeed = output<Feed>();
  readonly reloadFeed = output<{ feed: Feed; force: boolean }>();
  readonly markAllAsRead = output<Feed>();

  private imageErrorSignal = signal<boolean>(false);
  protected readonly imageError = this.imageErrorSignal.asReadonly();

  protected onImageError(): void {
    this.imageErrorSignal.set(true);
  }

  protected getFeedIcon(type: string): string {
    const icons: Record<string, string> = {
      article: "article",
      youtube: "play_circle",
      podcast: "podcast",
      reddit: "forum",
    };
    return icons[type] || "rss_feed";
  }

  protected onToggleEnabled(): void {
    this.toggleEnabled.emit(this.feed());
  }

  protected onDeleteFeed(): void {
    this.deleteFeed.emit(this.feed());
  }

  protected onReloadFeed(force: boolean): void {
    this.reloadFeed.emit({ feed: this.feed(), force });
  }

  protected onMarkAllAsRead(): void {
    this.markAllAsRead.emit(this.feed());
  }
}
