/**
 * Scheduled tasks list component.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { AdminTasksService, type ScheduledTask } from '../../core/services/admin-tasks.service';
import { TaskHistoryDialogComponent } from './task-history-dialog.component';

@Component({
  selector: 'app-tasks-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatChipsModule,
  ],
  template: `
    <div class="tasks-list-container animate-fade-in">
      <div class="header">
        <h1>Scheduled Tasks</h1>
        <button mat-raised-button color="primary" (click)="loadTasks()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
      </div>

      @if (loading()) {
        <div class="state-center loading">
          <mat-spinner></mat-spinner>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="loadTasks()">Retry</button>
          </mat-card-content>
        </mat-card>
      } @else if (tasks().length === 0) {
        <mat-card class="empty-card">
          <mat-card-content>
            <p>No scheduled tasks found. Tasks should be registered when the scheduler starts.</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card>
          <mat-card-content>
            <table mat-table [dataSource]="tasks()" class="tasks-table">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let task">{{ task.name }}</td>
              </ng-container>

              <ng-container matColumnDef="cron">
                <th mat-header-cell *matHeaderCellDef>Cron Expression</th>
                <td mat-cell *matCellDef="let task">
                  <code>{{ task.cronExpression }}</code>
                </td>
              </ng-container>

              <ng-container matColumnDef="enabled">
                <th mat-header-cell *matHeaderCellDef>Enabled</th>
                <td mat-cell *matCellDef="let task">
                  <mat-slide-toggle
                    [checked]="task.enabled"
                    (change)="toggleTask(task.id, $event.checked)"
                    [disabled]="toggling()"
                  >
                  </mat-slide-toggle>
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let task">
                  <button
                    mat-icon-button
                    (click)="triggerTask(task.id)"
                    [disabled]="triggering().has(task.id)"
                    matTooltip="Trigger task manually"
                  >
                    <mat-icon>play_arrow</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    (click)="viewHistory(task.id)"
                    matTooltip="View execution history"
                  >
                    <mat-icon>history</mat-icon>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
            </table>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .tasks-list-container {
        padding: 0;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 32px;
      }

      h1 {
        margin: 24px 0 0 0;
        font-size: 2.5rem;
        font-weight: 500;
      }

      .header button {
        height: 40px;
      }

      .empty-card {
        text-align: center;
        padding: 40px;
      }

      .tasks-table {
        width: 100%;
      }

      .tasks-table code {
        background: rgba(0, 0, 0, 0.05);
        padding: 4px 8px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 0.875rem;
      }

      .error-card {
        text-align: center;
        padding: 60px 40px;
      }

      .state-center {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }
    `,
  ],
})
export class TasksListComponent implements OnInit, OnDestroy {
  private tasksService = inject(AdminTasksService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();

  loading = signal(false);
  error = signal<string | null>(null);
  tasks = signal<ScheduledTask[]>([]);
  toggling = signal(false);
  triggering = signal<Set<string>>(new Set());

  displayedColumns: string[] = ['name', 'cron', 'enabled', 'actions'];

  ngOnInit() {
    this.loadTasks();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTasks() {
    this.loading.set(true);
    this.error.set(null);

    this.tasksService.getScheduledTasks().subscribe({
      next: tasks => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.message || 'Failed to load scheduled tasks');
        this.loading.set(false);
      },
    });
  }

  toggleTask(id: string, enabled: boolean) {
    this.toggling.set(true);

    const action = enabled ? this.tasksService.enableTask(id) : this.tasksService.disableTask(id);

    action.subscribe({
      next: () => {
        this.snackBar.open(`Task ${enabled ? 'enabled' : 'disabled'}`, 'Close', { duration: 3000 });
        this.loadTasks();
        this.toggling.set(false);
      },
      error: err => {
        this.snackBar.open(err.message || 'Failed to toggle task', 'Close', { duration: 5000 });
        this.toggling.set(false);
        this.loadTasks(); // Reload to reset state
      },
    });
  }

  triggerTask(id: string) {
    const current = this.triggering();
    current.add(id);
    this.triggering.set(new Set(current));

    this.tasksService.triggerTask(id).subscribe({
      next: () => {
        this.snackBar.open('Task triggered successfully', 'Close', { duration: 3000 });
        const updated = this.triggering();
        updated.delete(id);
        this.triggering.set(new Set(updated));
      },
      error: err => {
        this.snackBar.open(err.message || 'Failed to trigger task', 'Close', { duration: 5000 });
        const updated = this.triggering();
        updated.delete(id);
        this.triggering.set(new Set(updated));
      },
    });
  }

  viewHistory(id: string) {
    this.dialog.open(TaskHistoryDialogComponent, {
      width: '800px',
      data: { taskId: id },
    });
  }
}
