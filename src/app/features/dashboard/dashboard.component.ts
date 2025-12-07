/**
 * Dashboard component displaying statistics and quick actions.
 */

import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatGridListModule } from '@angular/material/grid-list';
import { StatisticsService } from '../../core/services/statistics.service';
import { interval, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatGridListModule,
  ],
  template: `
    <div class="dashboard animate-fade-in">
      <h1>Dashboard</h1>

      @if (statisticsService.loading()) {
        <div class="state-center loading" aria-live="polite" aria-busy="true">
          <mat-spinner aria-hidden="true"></mat-spinner>
        </div>
      } @else if (statisticsService.error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <p>{{ statisticsService.error() }}</p>
            <button mat-raised-button color="primary" (click)="refresh()">Retry</button>
          </mat-card-content>
        </mat-card>
      } @else if (statisticsService.statistics(); as stats) {
        <!-- Main stats cards -->
        <div class="stats-grid">
          <mat-card
            class="card-elevated card-gradient-bar clickable-card"
            [routerLink]="['/feeds']"
            role="button"
            tabindex="0"
          >
            <mat-card-header>
              <mat-icon mat-card-avatar>rss_feed</mat-icon>
              <mat-card-title>{{ stats.totalFeeds }}</mat-card-title>
              <mat-card-subtitle>Total Feeds</mat-card-subtitle>
            </mat-card-header>
          </mat-card>

          <mat-card
            class="card-elevated card-gradient-bar clickable-card"
            [routerLink]="['/articles']"
            role="button"
            tabindex="0"
          >
            <mat-card-header>
              <mat-icon mat-card-avatar>article</mat-icon>
              <mat-card-title>{{ stats.totalArticles }}</mat-card-title>
              <mat-card-subtitle>Total Articles</mat-card-subtitle>
            </mat-card-header>
          </mat-card>

          <mat-card
            class="card-elevated card-gradient-bar clickable-card"
            [routerLink]="['/articles']"
            [queryParams]="{ read_state: 'unread' }"
            role="button"
            tabindex="0"
          >
            <mat-card-header>
              <mat-icon mat-card-avatar color="primary">mail</mat-icon>
              <mat-card-title>{{ stats.totalUnread }}</mat-card-title>
              <mat-card-subtitle>Unread Articles</mat-card-subtitle>
            </mat-card-header>
          </mat-card>

          <mat-card
            class="card-elevated card-gradient-bar clickable-card"
            [routerLink]="['/articles']"
            [queryParams]="{ read_state: 'read' }"
            role="button"
            tabindex="0"
          >
            <mat-card-header>
              <mat-icon mat-card-avatar color="accent">check_circle</mat-icon>
              <mat-card-title>{{ stats.readPercentage }}%</mat-card-title>
              <mat-card-subtitle>Read</mat-card-subtitle>
            </mat-card-header>
          </mat-card>
        </div>

        <!-- Feed type breakdown -->
        <mat-card class="breakdown-card">
          <mat-card-header>
            <mat-card-title>Feed Types</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="feed-types">
              <div
                class="feed-type"
                (click)="navigateToFeeds('article')"
                role="button"
                tabindex="0"
              >
                <mat-icon>article</mat-icon>
                <span>{{ stats.articleFeeds }} Articles</span>
              </div>
              <div
                class="feed-type"
                (click)="navigateToFeeds('youtube')"
                role="button"
                tabindex="0"
              >
                <mat-icon>video_library</mat-icon>
                <span>{{ stats.videoFeeds }} Videos</span>
              </div>
              <div
                class="feed-type"
                (click)="navigateToFeeds('podcast')"
                role="button"
                tabindex="0"
              >
                <mat-icon>headphones</mat-icon>
                <span>{{ stats.podcastFeeds }} Podcasts</span>
              </div>
              <div class="feed-type" (click)="navigateToFeeds('reddit')" role="button" tabindex="0">
                <mat-icon>forum</mat-icon>
                <span>{{ stats.redditFeeds }} Reddit</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Quick actions -->
        <mat-card class="actions-card">
          <mat-card-header>
            <mat-card-title>Quick Actions</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="actions">
              <button mat-raised-button color="primary" routerLink="/feeds/create">
                <mat-icon>add</mat-icon>
                Create Feed
              </button>
              <button mat-raised-button routerLink="/feeds">
                <mat-icon>list</mat-icon>
                View All Feeds
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .dashboard {
        padding: 0;
      }

      h1 {
        margin: 24px 0 32px 0;
        font-size: 2.5rem;
        font-weight: 500;
        letter-spacing: -0.02em;
        color: var(--mat-sys-on-surface);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 20px;
        margin-bottom: 32px;
      }

      .clickable-card {
        cursor: pointer;
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;
      }

      .clickable-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      }

      .clickable-card:focus {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }

      mat-card-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 24px;
      }

      mat-card-header mat-icon[mat-card-avatar] {
        font-size: 56px;
        width: 56px;
        height: 56px;
        opacity: 0.9;
        transition: transform 0.3s ease;
      }

      .stats-grid mat-card:hover mat-icon[mat-card-avatar] {
        transform: scale(1.1);
      }

      mat-card-title {
        font-size: 2.25rem !important;
        font-weight: 600 !important;
        line-height: 1.2 !important;
        margin: 0 !important;
        color: var(--mat-sys-on-surface);
      }

      mat-card-subtitle {
        font-size: 0.875rem !important;
        font-weight: 400 !important;
        margin-top: 4px !important;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .breakdown-card,
      .actions-card {
        margin-bottom: 32px;
        border-radius: 12px;
        overflow: hidden;
      }

      .breakdown-card mat-card-header,
      .actions-card mat-card-header {
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      }

      .breakdown-card mat-card-title,
      .actions-card mat-card-title {
        font-size: 1.25rem !important;
        font-weight: 500 !important;
        margin: 0 !important;
      }

      .breakdown-card mat-card-content,
      .actions-card mat-card-content {
        padding: 24px !important;
      }

      .feed-types {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 20px;
      }

      .feed-type {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
        transition: all 0.2s ease;
        cursor: pointer;
      }

      .feed-type:hover {
        background: rgba(0, 0, 0, 0.05);
        transform: translateX(4px);
      }

      .feed-type:focus {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }

      .feed-type mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
        opacity: 0.8;
      }

      .feed-type span {
        font-size: 1rem;
        font-weight: 500;
        color: var(--mat-sys-on-surface);
      }

      .actions {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }

      .actions button {
        min-width: 160px;
        height: 48px;
        font-size: 1rem;
        font-weight: 500;
        border-radius: 8px;
        transition: all 0.2s ease;
      }

      .actions button mat-icon {
        margin-right: 8px;
      }

      .actions button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .error-card {
        text-align: center;
        padding: 60px 40px;
        border-radius: 12px;
      }

      .error-card mat-card-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
      }

      .error-card p {
        font-size: 1.125rem;
        color: var(--mat-sys-error);
        margin: 0;
      }

      /* Responsive adjustments */
      @media (max-width: 600px) {
        .dashboard {
          padding: 0;
        }

        h1 {
          font-size: 2rem;
          margin-bottom: 24px;
          padding: 0 16px;
        }

        .stats-grid {
          grid-template-columns: 1fr;
          gap: 0;
          margin-bottom: 0;
        }

        .stats-grid mat-card {
          border-radius: 0;
          margin: 0;
        }

        mat-card-header {
          padding: 16px 10px;
        }

        mat-card-title {
          font-size: 1.875rem !important;
        }

        .breakdown-card,
        .actions-card {
          border-radius: 0;
          margin: 0;
        }

        .breakdown-card mat-card-content,
        .actions-card mat-card-content {
          padding: 16px 10px !important;
        }

        .feed-types {
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .actions {
          flex-direction: column;
        }

        .actions button {
          width: 100%;
        }
      }

      @media (max-width: 480px) {
        .dashboard {
          padding: 0;
        }

        h1 {
          font-size: 1.75rem;
          padding: 0 8px;
        }

        mat-card-header {
          padding: 12px 8px;
          gap: 12px;
        }

        mat-card-header mat-icon[mat-card-avatar] {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        mat-card-title {
          font-size: 1.5rem !important;
        }

        .breakdown-card mat-card-content,
        .actions-card mat-card-content {
          padding: 12px 8px !important;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  statisticsService = inject(StatisticsService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  ngOnInit() {
    // Load statistics immediately
    this.statisticsService.loadStatistics().subscribe();

    // Auto-refresh every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.statisticsService.loadStatistics().subscribe();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh() {
    this.statisticsService.loadStatistics().subscribe();
  }

  navigateToFeeds(type: string) {
    this.router.navigate(['/feeds'], { queryParams: { type } });
  }
}
