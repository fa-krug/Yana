/**
 * Article bulk actions component - handles bulk operations on filtered articles.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Mark all filtered articles as read/unread
 * - Delete all filtered articles
 * - Refresh all filtered articles
 */

// Angular core
import {
  Component,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";

// RxJS
import { finalize } from "rxjs";

// Angular Material
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";

// Application
import {
  ArticleService,
  ArticleFilters,
} from "@app/core/services/article.service";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "@app/shared/components/confirm-dialog.component";

@Component({
  selector: "app-article-bulk-actions",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="action-buttons">
      <button
        mat-icon-button
        class="mark-read-button"
        [disabled]="bulkOperationLoading()"
        (click)="markAllFilteredRead(true)"
        matTooltip="Mark all filtered articles as read"
        aria-label="Mark all filtered articles as read"
        [attr.aria-busy]="bulkOperationLoading() === 'read'"
      >
        <mat-icon [class.spinning]="bulkOperationLoading() === 'read'"
          >check_circle</mat-icon
        >
      </button>
      <button
        mat-icon-button
        class="mark-unread-button"
        [disabled]="bulkOperationLoading()"
        (click)="markAllFilteredRead(false)"
        matTooltip="Mark all filtered articles as unread"
        aria-label="Mark all filtered articles as unread"
        [attr.aria-busy]="bulkOperationLoading() === 'unread'"
      >
        <mat-icon [class.spinning]="bulkOperationLoading() === 'unread'"
          >radio_button_unchecked</mat-icon
        >
      </button>
      <button
        mat-icon-button
        class="delete-button"
        [disabled]="bulkOperationLoading()"
        (click)="deleteAllFiltered()"
        matTooltip="Delete all filtered articles"
        aria-label="Delete all filtered articles"
        [attr.aria-busy]="bulkOperationLoading() === 'delete'"
      >
        <mat-icon [class.spinning]="bulkOperationLoading() === 'delete'"
          >delete</mat-icon
        >
      </button>
      <button
        mat-icon-button
        class="refresh-button"
        [disabled]="bulkOperationLoading()"
        (click)="refreshAllFiltered()"
        matTooltip="Refresh all filtered articles"
        aria-label="Refresh all filtered articles"
        [attr.aria-busy]="bulkOperationLoading() === 'refresh'"
      >
        <mat-icon [class.spinning]="bulkOperationLoading() === 'refresh'"
          >refresh</mat-icon
        >
      </button>
    </div>
  `,
  styles: [
    `
      .action-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: nowrap;
        align-items: center;
      }

      mat-icon-button {
        font-weight: 500;
        transition: all 0.2s ease;
      }

      mat-icon-button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }

      mat-icon-button mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        margin: 0;
        transition: transform 0.3s ease;
      }

      .mark-read-button {
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

      .mark-read-button:hover:not([disabled]) {
        background-color: #45a049;
      }

      .mark-read-button[disabled] {
        background-color: rgba(76, 175, 80, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      .mark-unread-button {
        color: white;
        background-color: #2196f3;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .mark-unread-button:hover:not([disabled]) {
        background-color: #1976d2;
      }

      .mark-unread-button[disabled] {
        background-color: rgba(33, 150, 243, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      .delete-button {
        color: white;
        background-color: #f44336;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .delete-button:hover:not([disabled]) {
        background-color: #d32f2f;
      }

      .delete-button[disabled] {
        background-color: rgba(244, 67, 54, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      .refresh-button {
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

      .refresh-button:hover:not([disabled]) {
        background-color: #1565c0;
      }

      .refresh-button[disabled] {
        background-color: rgba(25, 118, 210, 0.5);
        color: rgba(255, 255, 255, 0.7);
      }

      mat-icon-button mat-icon.spinning {
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
    `,
  ],
})
export class ArticleBulkActionsComponent {
  readonly articleService = input.required<ArticleService>();
  readonly getCurrentFilters = input.required<() => ArticleFilters>();

  readonly refreshRequested = output<void>();

  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  protected readonly bulkOperationLoading = signal<
    "read" | "unread" | "delete" | "refresh" | null
  >(null);

  markAllFilteredRead(isRead: boolean) {
    const loadingType = isRead ? "read" : "unread";
    this.bulkOperationLoading.set(loadingType);

    const filters = this.getCurrentFilters()();
    this.articleService()
      .markAllFilteredRead(filters, isRead)
      .pipe(finalize(() => this.bulkOperationLoading.set(null)))
      .subscribe({
        next: (result) => {
          this.snackBar.open(result.message, "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
        },
        error: (error) => {
          this.snackBar.open(
            `Failed to mark articles: ${error.message}`,
            "Close",
            {
              duration: 3000,
            },
          );
        },
      });
  }

  deleteAllFiltered() {
    const dialogData: ConfirmDialogData = {
      title: "Delete Articles",
      message:
        "Are you sure you want to delete all filtered articles? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmColor: "warn",
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: "500px",
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.bulkOperationLoading.set("delete");

      const filters = this.getCurrentFilters()();
      this.articleService()
        .deleteAllFiltered(filters)
        .pipe(finalize(() => this.bulkOperationLoading.set(null)))
        .subscribe({
          next: (result) => {
            this.snackBar.open(result.message, "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.refreshRequested.emit();
          },
          error: (error) => {
            this.snackBar.open(
              `Failed to delete articles: ${error.message}`,
              "Close",
              {
                duration: 3000,
              },
            );
          },
        });
    });
  }

  refreshAllFiltered() {
    this.bulkOperationLoading.set("refresh");

    const filters = this.getCurrentFilters()();
    this.articleService()
      .refreshAllFiltered(filters)
      .pipe(finalize(() => this.bulkOperationLoading.set(null)))
      .subscribe({
        next: (result) => {
          this.snackBar.open(result.message, "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
        },
        error: (error) => {
          this.snackBar.open(
            `Failed to refresh articles: ${error.message}`,
            "Close",
            {
              duration: 3000,
            },
          );
        },
      });
  }
}
