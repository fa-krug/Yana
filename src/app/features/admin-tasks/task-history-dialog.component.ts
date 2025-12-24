/**
 * Task history dialog component.
 */

import { CommonModule } from "@angular/common";
import {
  Component,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { MatChipsModule } from "@angular/material/chips";
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTableModule } from "@angular/material/table";

import {
  AdminTasksService,
  type TaskExecution,
} from "@app/core/services/admin-tasks.service";

@Component({
  selector: "app-task-history-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatChipsModule,
  ],
  template: `
    <h2 mat-dialog-title>Execution History</h2>
    <mat-dialog-content>
      @if (loading()) {
        <div class="state-center">
          <mat-spinner></mat-spinner>
        </div>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <table mat-table [dataSource]="history()" class="history-table">
          <ng-container matColumnDef="executedAt">
            <th mat-header-cell *matHeaderCellDef>Executed At</th>
            <td mat-cell *matCellDef="let exec">
              {{ exec.executedAt | date: "short" }}
            </td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let exec">
              <mat-chip
                [color]="exec.status === 'success' ? 'primary' : 'warn'"
              >
                {{ exec.status }}
              </mat-chip>
            </td>
          </ng-container>

          <ng-container matColumnDef="duration">
            <th mat-header-cell *matHeaderCellDef>Duration</th>
            <td mat-cell *matCellDef="let exec">
              {{
                exec.duration ? (exec.duration / 1000).toFixed(2) + "s" : "-"
              }}
            </td>
          </ng-container>

          <ng-container matColumnDef="error">
            <th mat-header-cell *matHeaderCellDef>Error</th>
            <td mat-cell *matCellDef="let exec">{{ exec.error || "-" }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .history-table {
        width: 100%;
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
export class TaskHistoryDialogComponent implements OnInit {
  private tasksService = inject(AdminTasksService);
  private dialogRef = inject(MatDialogRef<TaskHistoryDialogComponent>);
  private data = inject<{ taskId: string }>(MAT_DIALOG_DATA);

  loading = signal(false);
  error = signal<string | null>(null);
  history = signal<TaskExecution[]>([]);

  displayedColumns: string[] = ["executedAt", "status", "duration", "error"];

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.loading.set(true);
    this.error.set(null);

    this.tasksService.getTaskHistory(this.data.taskId, 14).subscribe({
      next: (history) => {
        this.history.set(history);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || "Failed to load history");
        this.loading.set(false);
      },
    });
  }

  close() {
    this.dialogRef.close();
  }
}
