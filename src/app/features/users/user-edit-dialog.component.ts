import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import {
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatIconModule } from "@angular/material/icon";
import { MatDialog } from "@angular/material/dialog";
import {
  AdminUsersService,
  User,
} from "@app/core/services/admin-users.service";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "@app/shared/components/confirm-dialog.component";

@Component({
  selector: "app-user-edit-dialog",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit User</h2>
    <mat-dialog-content>
      <form [formGroup]="userForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Username</mat-label>
          <input matInput formControlName="username" required />
          @if (
            userForm.get("username")?.touched &&
            userForm.get("username")?.hasError("required")
          ) {
            <mat-error>Username is required</mat-error>
          }
          @if (
            userForm.get("username")?.touched &&
            userForm.get("username")?.hasError("minlength")
          ) {
            <mat-error>Username must be at least 3 characters</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" required />
          @if (
            userForm.get("email")?.touched &&
            userForm.get("email")?.hasError("required")
          ) {
            <mat-error>Email is required</mat-error>
          }
          @if (
            userForm.get("email")?.touched &&
            userForm.get("email")?.hasError("email")
          ) {
            <mat-error>Invalid email address</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>First Name</mat-label>
          <input matInput formControlName="firstName" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Last Name</mat-label>
          <input matInput formControlName="lastName" />
        </mat-form-field>

        <mat-checkbox formControlName="isSuperuser">Superuser</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="actions">
      <button
        mat-raised-button
        color="primary"
        (click)="submit()"
        [disabled]="!userForm.valid || loading"
        class="action-button"
      >
        Save
      </button>
      <button
        mat-raised-button
        color="warn"
        (click)="deleteUser()"
        [disabled]="loading"
        class="delete-button action-button"
      >
        Delete
      </button>
      <button mat-button (click)="cancel()" class="action-button">
        Cancel
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }

      mat-dialog-content {
        min-width: 500px;
        padding: 24px;
      }

      mat-form-field {
        margin-top: 16px;
        margin-bottom: 16px;
        display: block;
      }

      mat-form-field:first-of-type {
        margin-top: 16px;
      }

      mat-checkbox {
        margin-top: 16px;
        display: block;
      }

      mat-dialog-actions.actions {
        padding: 16px 24px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: stretch;
        width: 100%;
        box-sizing: border-box;
      }

      .action-button {
        width: 100%;
        min-width: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        text-align: center;
        padding: 12px 16px !important;
        box-sizing: border-box;
        margin: 0 !important;
      }

      .action-button ::ng-deep .mat-button-wrapper,
      .action-button ::ng-deep .mat-mdc-button-persistent-ripple,
      .action-button ::ng-deep .mdc-button__label {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        padding: 0;
        margin: 0;
      }

      .delete-button {
        color: #f44336 !important;
      }

      .delete-button:hover {
        background: rgba(244, 67, 54, 0.08) !important;
      }

      .delete-button mat-icon {
        margin-right: 4px;
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      /* Mobile-friendly dialog sizing (align with other dialogs) */
      @media (max-width: 768px) {
        :host ::ng-deep .mat-mdc-dialog-surface {
          width: calc(100vw - 24px);
          max-width: calc(100vw - 24px);
          min-width: 0;
          margin: 0 12px;
        }

        :host ::ng-deep .cdk-global-overlay-wrapper {
          align-items: flex-start;
          padding: 12px 0 24px;
        }

        mat-dialog-content {
          min-width: 0;
          padding: 16px;
        }

        mat-dialog-actions.actions {
          padding: 12px 16px;
          gap: 6px;
          margin: 0;
        }

        .action-button {
          margin: 0 auto;
          padding: 12px 16px;
          width: 100%;
        }
      }
    `,
  ],
})
export class UserEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UserEditDialogComponent>);
  private usersService = inject(AdminUsersService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  data: User = inject(MAT_DIALOG_DATA);

  userForm: FormGroup;
  loading = false;

  constructor() {
    this.userForm = this.fb.group({
      username: [
        this.data.username,
        [Validators.required, Validators.minLength(3)],
      ],
      email: [this.data.email, [Validators.required, Validators.email]],
      firstName: [this.data.firstName || ""],
      lastName: [this.data.lastName || ""],
      isSuperuser: [this.data.isSuperuser],
    });
  }

  submit(): void {
    if (this.userForm.valid) {
      this.loading = true;
      const formValue = this.userForm.value;
      this.usersService.updateUser(this.data.id, formValue).subscribe({
        next: () => {
          this.loading = false;
          this.snackBar.open("User updated successfully", "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          const errorMessage = error?.error?.message || "Failed to update user";
          this.snackBar.open(errorMessage, "Close", { duration: 5000 });
        },
      });
    } else {
      Object.keys(this.userForm.controls).forEach((key) => {
        this.userForm.get(key)?.markAsTouched();
      });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  deleteUser(): void {
    const dialogData: ConfirmDialogData = {
      title: "Delete User",
      message: `Are you sure you want to delete user "${this.data.username}"? This action cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmColor: "warn",
    };

    const confirmDialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: "500px",
      data: dialogData,
    });

    confirmDialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.loading = true;
        this.usersService.deleteUser(this.data.id).subscribe({
          next: () => {
            this.loading = false;
            this.snackBar.open("User deleted successfully", "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.dialogRef.close("deleted");
          },
          error: (error) => {
            this.loading = false;
            const errorMessage =
              error?.error?.message || "Failed to delete user";
            this.snackBar.open(errorMessage, "Close", { duration: 5000 });
          },
        });
      }
    });
  }
}
