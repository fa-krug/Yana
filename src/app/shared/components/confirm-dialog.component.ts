/**
 * Confirmation dialog component - reusable confirmation dialog.
 */

import { Component, inject, ChangeDetectionStrategy } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: "primary" | "accent" | "warn";
}

@Component({
  selector: "app-confirm-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <mat-icon [color]="data.confirmColor || 'warn'">warning</mat-icon>
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">
        {{ data.cancelText || "Cancel" }}
      </button>
      <button
        mat-raised-button
        [color]="data.confirmColor || 'warn'"
        [mat-dialog-close]="true"
        cdkFocusInitial
      >
        {{ data.confirmText || "Confirm" }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h2 {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }

      p {
        margin: 0;
        color: rgba(0, 0, 0, 0.7);
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
}
