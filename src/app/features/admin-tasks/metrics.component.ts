/**
 * Metrics component - displays task metrics and worker pool status.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subject, interval, takeUntil } from "rxjs";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatChipsModule } from "@angular/material/chips";
import {
  AdminTasksService,
  type TaskMetrics,
  type WorkerPoolStatus,
  type SchedulerStatus,
} from "../../core/services/admin-tasks.service";

@Component({
  selector: "app-metrics",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
  ],
  template: `
    <div class="metrics-container animate-fade-in">
      <h1>Task Metrics</h1>

      @if (loading()) {
        <div class="state-center loading">
          <mat-spinner></mat-spinner>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="loadMetrics()">
              Retry
            </button>
          </mat-card-content>
        </mat-card>
      } @else {
        <!-- Scheduler Status -->
        <mat-card class="metrics-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>schedule</mat-icon>
            <mat-card-title>Scheduler Status</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (schedulerStatus(); as status) {
              <div class="status-grid">
                <div class="status-item">
                  <span class="label">Status:</span>
                  <mat-chip
                    [color]="status.running ? 'primary' : 'warn'"
                    [class.status-badge]="true"
                    [class.status-running]="status.running"
                    [class.status-stopped]="!status.running"
                  >
                    {{ status.running ? "Running" : "Stopped" }}
                  </mat-chip>
                </div>
                <div class="status-item">
                  <span class="label">Scheduled Tasks:</span>
                  <span class="value">{{ status.scheduledTasks }}</span>
                </div>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Worker Pool Status -->
        <mat-card class="metrics-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>settings</mat-icon>
            <mat-card-title>Worker Pool Status</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (workerPoolStatus(); as status) {
              <div class="status-grid">
                <div class="status-item">
                  <span class="label">Status:</span>
                  <mat-chip
                    [color]="status.running ? 'primary' : 'warn'"
                    [class.status-badge]="true"
                    [class.status-running]="status.running"
                    [class.status-stopped]="!status.running"
                  >
                    {{ status.running ? "Running" : "Stopped" }}
                  </mat-chip>
                </div>
                <div class="status-item">
                  <span class="label">Workers:</span>
                  <span class="value">{{ status.workerCount }}</span>
                </div>
                <div class="status-item">
                  <span class="label">Active:</span>
                  <span class="value">{{ status.activeWorkers }}</span>
                </div>
                <div class="status-item">
                  <span class="label">Queue Depth:</span>
                  <span class="value">{{ status.queueDepth }}</span>
                </div>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Task Metrics -->
        <mat-card class="metrics-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>dashboard</mat-icon>
            <mat-card-title>Task Statistics</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (metrics(); as m) {
              <div class="metrics-grid">
                <div class="metric-item pending">
                  <mat-icon>schedule</mat-icon>
                  <div class="metric-content">
                    <span class="metric-label">Pending</span>
                    <span class="metric-value">{{ m.pending }}</span>
                  </div>
                </div>
                <div class="metric-item running">
                  <mat-icon>sync</mat-icon>
                  <div class="metric-content">
                    <span class="metric-label">Running</span>
                    <span class="metric-value">{{ m.running }}</span>
                  </div>
                </div>
                <div class="metric-item completed">
                  <mat-icon>check_circle</mat-icon>
                  <div class="metric-content">
                    <span class="metric-label">Completed</span>
                    <span class="metric-value">{{ m.completed }}</span>
                  </div>
                </div>
                <div class="metric-item failed">
                  <mat-icon>error</mat-icon>
                  <div class="metric-content">
                    <span class="metric-label">Failed</span>
                    <span class="metric-value">{{ m.failed }}</span>
                  </div>
                </div>
                <div class="metric-item total">
                  <mat-icon>list</mat-icon>
                  <div class="metric-content">
                    <span class="metric-label">Total</span>
                    <span class="metric-value">{{ m.total }}</span>
                  </div>
                </div>
              </div>

              @if (getTypeKeys(m.byType).length > 0) {
                <div class="type-breakdown">
                  <h3>By Type</h3>
                  <div class="type-list">
                    @for (type of getTypeKeys(m.byType); track type) {
                      <mat-chip>
                        {{ type }}: {{ m.byType[type].count }}
                      </mat-chip>
                    }
                  </div>
                </div>
              }
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .metrics-container {
        padding: 0;
      }

      h1 {
        margin: 24px 0 32px 0;
        font-size: 2.5rem;
        font-weight: 500;
      }

      .metrics-card {
        margin-bottom: 24px;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }

      .status-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .status-item .label {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.6);
      }

      .status-item .value {
        font-size: 1.5rem;
        font-weight: 500;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }

      .metric-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.02);
      }

      .metric-item mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      .metric-content {
        display: flex;
        flex-direction: column;
      }

      .metric-label {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.6);
      }

      .metric-value {
        font-size: 1.75rem;
        font-weight: 600;
      }

      .type-breakdown {
        margin-top: 24px;
        padding-top: 24px;
        border-top: 1px solid rgba(0, 0, 0, 0.12);
      }

      .type-breakdown h3 {
        margin: 0 0 16px 0;
        font-size: 1.125rem;
        font-weight: 500;
      }

      .type-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .error-card {
        text-align: center;
        padding: 60px 40px;
      }

      .error-card mat-card-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
      }

      .state-center {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }

      .status-badge {
        min-width: 100px;
        width: 100px;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        font-weight: 500;
      }

      :host ::ng-deep .status-badge .mdc-evolution-chip__cell {
        text-align: center;
        width: 100%;
        display: flex;
        justify-content: center;
        margin: 0 auto;
      }

      .status-running {
        background-color: #4caf50 !important;
        color: white !important;
      }

      .status-stopped {
        background-color: #f44336 !important;
        color: white !important;
      }
    `,
  ],
})
export class MetricsComponent implements OnInit, OnDestroy {
  private tasksService = inject(AdminTasksService);
  private destroy$ = new Subject<void>();

  loading = signal(false);
  error = signal<string | null>(null);
  metrics = signal<TaskMetrics | null>(null);
  workerPoolStatus = signal<WorkerPoolStatus | null>(null);
  schedulerStatus = signal<SchedulerStatus | null>(null);

  ngOnInit() {
    this.loadMetrics();

    // Auto-refresh every 10 seconds
    interval(10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadMetrics();
      });

    // Subscribe to SSE events for real-time updates
    this.tasksService
      .connectSSE()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          // Refresh metrics on relevant events
          if (
            event.event === "task-updated" ||
            event.event === "task-created" ||
            event.event === "metrics-updated" ||
            event.event === "worker-status-changed"
          ) {
            this.loadMetrics();
          }
        },
        error: (err) => {
          console.error("SSE connection error:", err);
        },
      });
  }

  ngOnDestroy() {
    this.tasksService.disconnectSSE();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMetrics() {
    this.loading.set(true);
    this.error.set(null);

    this.tasksService.getMetrics().subscribe({
      next: (metrics) => {
        this.metrics.set(metrics);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || "Failed to load metrics");
        this.loading.set(false);
      },
    });

    this.tasksService.getWorkerPoolStatus().subscribe({
      next: (status) => {
        this.workerPoolStatus.set(status);
      },
      error: (err) => {
        console.error("Failed to load worker pool status:", err);
      },
    });

    this.tasksService.getSchedulerStatus().subscribe({
      next: (status) => {
        this.schedulerStatus.set(status);
      },
      error: (err) => {
        console.error("Failed to load scheduler status:", err);
      },
    });
  }

  getTypeKeys(
    byType: Record<string, { count: number; status: string }>,
  ): string[] {
    return Object.keys(byType);
  }
}
