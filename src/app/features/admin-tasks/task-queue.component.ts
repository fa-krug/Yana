/**
 * Task queue component.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from "rxjs";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatTooltipModule } from "@angular/material/tooltip";
import {
  AdminTasksService,
  type Task,
  type TaskFilters,
  type PaginatedTasks,
} from "@app/core/services/admin-tasks.service";
import { TaskDetailsDialogComponent } from "./task-details-dialog.component";

@Component({
  selector: "app-task-queue",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  template: `
    <div class="task-queue-container animate-fade-in">
      <h1>Task Queue</h1>

      <!-- Filters -->
      <mat-card class="filters-card">
        <mat-card-content>
          <div class="filters-grid">
            <mat-form-field appearance="outline">
              <mat-label>Status</mat-label>
              <mat-select [formControl]="statusControl" multiple>
                <mat-option value="pending">Pending</mat-option>
                <mat-option value="running">Running</mat-option>
                <mat-option value="completed">Completed</mat-option>
                <mat-option value="failed">Failed</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Type</mat-label>
              <input matInput [formControl]="typeControl" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>From Date</mat-label>
              <input
                matInput
                [matDatepicker]="fromPicker"
                [formControl]="fromDateControl"
              />
              <mat-datepicker-toggle
                matSuffix
                [for]="fromPicker"
              ></mat-datepicker-toggle>
              <mat-datepicker #fromPicker></mat-datepicker>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>To Date</mat-label>
              <input
                matInput
                [matDatepicker]="toPicker"
                [formControl]="toDateControl"
              />
              <mat-datepicker-toggle
                matSuffix
                [for]="toPicker"
              ></mat-datepicker-toggle>
              <mat-datepicker #toPicker></mat-datepicker>
            </mat-form-field>
          </div>
        </mat-card-content>
      </mat-card>

      @if (loading()) {
        <div class="state-center loading">
          <mat-spinner></mat-spinner>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="loadTasks()">
              Retry
            </button>
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card>
          <mat-card-content>
            <table mat-table [dataSource]="tasks()" class="tasks-table">
              <ng-container matColumnDef="id">
                <th mat-header-cell *matHeaderCellDef>ID</th>
                <td mat-cell *matCellDef="let task">{{ task.id }}</td>
              </ng-container>

              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>Type</th>
                <td mat-cell *matCellDef="let task">{{ task.type }}</td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let task">
                  <mat-chip [color]="getStatusColor(task.status)">
                    {{ task.status }}
                  </mat-chip>
                </td>
              </ng-container>

              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Created</th>
                <td mat-cell *matCellDef="let task">
                  {{ task.createdAt | date: "short" }}
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let task">
                  <button
                    mat-icon-button
                    [matMenuTriggerFor]="menu"
                    matTooltip="Actions"
                  >
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #menu="matMenu">
                    <button mat-menu-item (click)="viewDetails(task.id)">
                      <mat-icon>info</mat-icon>
                      <span>View Details</span>
                    </button>
                    @if (
                      task.status === "pending" || task.status === "running"
                    ) {
                      <button mat-menu-item (click)="cancelTask(task.id)">
                        <mat-icon>cancel</mat-icon>
                        <span>Cancel</span>
                      </button>
                    }
                    @if (task.status === "failed") {
                      <button mat-menu-item (click)="retryTask(task.id)">
                        <mat-icon>refresh</mat-icon>
                        <span>Retry</span>
                      </button>
                    }
                  </mat-menu>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
            </table>

            <mat-paginator
              [length]="total()"
              [pageSize]="pageSize()"
              [pageSizeOptions]="[10, 20, 50, 100]"
              (page)="onPageChange($event)"
            ></mat-paginator>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .task-queue-container {
        padding: 0;
      }

      h1 {
        margin: 24px 0 32px 0;
        font-size: 2.5rem;
        font-weight: 500;
      }

      .filters-card {
        margin-bottom: 24px;
      }

      .filters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }

      .tasks-table {
        width: 100%;
      }

      .error-card {
        text-align: center;
        padding: 60px 40px;
      }

      .error-card button {
        width: 100%;
      }

      .state-center {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }

      @media (max-width: 600px) {
        h1 {
          font-size: 2rem;
        }
      }
    `,
  ],
})
export class TaskQueueComponent implements OnInit, OnDestroy {
  private tasksService = inject(AdminTasksService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  loading = signal(false);
  error = signal<string | null>(null);
  tasks = signal<Task[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(20);

  statusControl = new FormControl<string[]>([]);
  typeControl = new FormControl<string>("");
  fromDateControl = new FormControl<Date | null>(null);
  toDateControl = new FormControl<Date | null>(null);

  displayedColumns: string[] = ["id", "type", "status", "createdAt", "actions"];

  ngOnInit() {
    // Setup filter debouncing
    this.statusControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadTasks());

    this.typeControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadTasks());

    this.fromDateControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadTasks());

    this.toDateControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadTasks());

    // Load initial tasks
    this.loadTasks();

    // Subscribe to SSE events for real-time updates
    this.tasksService
      .connectSSE()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          // Refresh task list on task updates
          if (
            event.event === "task-updated" ||
            event.event === "task-created"
          ) {
            const eventData = event.data as {
              taskId?: number;
              status?: string;
            };
            console.log(
              "[TaskQueue] Received SSE event:",
              event.event,
              "taskId:",
              eventData.taskId,
              "status:",
              eventData.status,
            );
            // Trigger change detection and reload tasks
            this.cdr.markForCheck();
            this.loadTasks();
          }
        },
        error: (err) => {
          console.error("[TaskQueue] SSE connection error:", err);
        },
      });
  }

  ngOnDestroy() {
    this.tasksService.disconnectSSE();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTasks() {
    this.loading.set(true);
    this.error.set(null);

    // Parse type filter - only include if non-empty
    const typeValue = this.typeControl.value?.trim();
    const typeFilter = typeValue
      ? typeValue
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t)
      : undefined;

    const filters: TaskFilters = {
      status:
        this.statusControl.value && this.statusControl.value.length > 0
          ? (this.statusControl.value as any)
          : undefined,
      type: typeFilter && typeFilter.length > 0 ? typeFilter : undefined,
      dateFrom: this.fromDateControl.value
        ? this.fromDateControl.value.toISOString()
        : undefined,
      dateTo: this.toDateControl.value
        ? this.toDateControl.value.toISOString()
        : undefined,
    };

    this.tasksService
      .listTasks(filters, { page: this.page(), limit: this.pageSize() })
      .subscribe({
        next: (result) => {
          this.tasks.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
          this.cdr.markForCheck(); // Ensure change detection runs
        },
        error: (err) => {
          this.error.set(err.message || "Failed to load tasks");
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  onPageChange(event: PageEvent) {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadTasks();
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

  viewDetails(id: number) {
    this.dialog.open(TaskDetailsDialogComponent, {
      width: "800px",
      data: { taskId: id },
    });
  }

  cancelTask(id: number) {
    this.tasksService.cancelTask(id).subscribe({
      next: () => {
        this.snackBar.open("Task cancelled", "Close", {
          duration: 3000,
          panelClass: ["success-snackbar"],
        });
        this.loadTasks();
      },
      error: (err) => {
        this.snackBar.open(err.message || "Failed to cancel task", "Close", {
          duration: 5000,
        });
      },
    });
  }

  retryTask(id: number) {
    this.tasksService.retryTask(id).subscribe({
      next: () => {
        this.snackBar.open("Task retried", "Close", {
          duration: 3000,
          panelClass: ["success-snackbar"],
        });
        this.loadTasks();
      },
      error: (err) => {
        this.snackBar.open(err.message || "Failed to retry task", "Close", {
          duration: 5000,
        });
      },
    });
  }
}
