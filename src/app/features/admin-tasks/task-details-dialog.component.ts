/**
 * Task details dialog component.
 */

import {
  Component,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import {
  AdminTasksService,
  type Task,
} from "@app/core/services/admin-tasks.service";

@Component({
  selector: "app-task-details-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatChipsModule,
  ],
  template: `
    <h2 mat-dialog-title>Task Details</h2>
    <mat-dialog-content>
      @if (loading()) {
        <div class="state-center">
          <mat-spinner></mat-spinner>
        </div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (task(); as t) {
        <div class="task-details">
          <div class="detail-row">
            <span class="label">ID:</span>
            <span class="value">{{ t.id }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Type:</span>
            <span class="value">{{ t.type }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Status:</span>
            <mat-chip [color]="getStatusColor(t.status)">{{
              t.status
            }}</mat-chip>
          </div>
          <div class="detail-row">
            <span class="label">Retries:</span>
            <span class="value">{{ t.retries }} / {{ t.maxRetries }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Created:</span>
            <span class="value">{{ t.createdAt | date: "short" }}</span>
          </div>
          @if (t.startedAt) {
            <div class="detail-row">
              <span class="label">Started:</span>
              <span class="value">{{ t.startedAt | date: "short" }}</span>
            </div>
          }
          @if (t.completedAt) {
            <div class="detail-row">
              <span class="label">Completed:</span>
              <span class="value">{{ t.completedAt | date: "short" }}</span>
            </div>
          }
          @if (t.error) {
            <div class="detail-row">
              <span class="label">Error:</span>
              <span class="value error-text">{{ t.error }}</span>
            </div>
          }
          <div class="detail-section">
            <h3>Payload</h3>
            <pre>{{ formatJSON(t.payload) }}</pre>
          </div>
          @if (t.result) {
            <div class="detail-section">
              <h3>Result</h3>
              <pre>{{ formatJSON(t.result) }}</pre>
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .task-details {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .detail-row {
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .detail-row .label {
        font-weight: 500;
        min-width: 100px;
      }

      .detail-row .value {
        flex: 1;
      }

      .error-text {
        color: red;
      }

      .detail-section {
        margin-top: 24px;
      }

      .detail-section h3 {
        margin: 0 0 8px 0;
        font-size: 1rem;
        font-weight: 500;
      }

      .detail-section pre {
        background: rgba(0, 0, 0, 0.05);
        padding: 16px;
        border-radius: 4px;
        overflow-x: auto;
        font-size: 0.875rem;
      }

      .state-center {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 200px;
      }

      .error {
        color: red;
      }
    `,
  ],
})
export class TaskDetailsDialogComponent implements OnInit {
  private tasksService = inject(AdminTasksService);
  private dialogRef = inject(MatDialogRef<TaskDetailsDialogComponent>);
  private data = inject<{ taskId: number }>(MAT_DIALOG_DATA);

  loading = signal(false);
  error = signal<string | null>(null);
  task = signal<Task | null>(null);

  ngOnInit() {
    this.loadTask();
  }

  loadTask() {
    this.loading.set(true);
    this.error.set(null);

    this.tasksService.getTaskDetails(this.data.taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || "Failed to load task details");
        this.loading.set(false);
      },
    });
  }

  formatJSON(obj: unknown): string {
    return JSON.stringify(obj, null, 2);
  }

  getStatusColor(status: string): "primary" | "accent" | "warn" {
    switch (status) {
      case "completed":
        return "primary";
      case "running":
        return "accent";
      case "failed":
        return "warn";
      default:
        return "primary";
    }
  }

  close() {
    this.dialogRef.close();
  }
}
