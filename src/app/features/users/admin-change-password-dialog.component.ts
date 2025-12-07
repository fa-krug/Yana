import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
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
import { AdminUsersService } from "../../core/services/admin-users.service";

@Component({
  selector: "app-admin-change-password-dialog",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Change Password for {{ data.username }}</h2>
    <mat-dialog-content>
      <form [formGroup]="passwordForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>New Password</mat-label>
          <input
            matInput
            type="password"
            formControlName="newPassword"
            required
          />
          @if (
            passwordForm.get("newPassword")?.touched &&
            passwordForm.get("newPassword")?.hasError("required")
          ) {
            <mat-error>New password is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Confirm New Password</mat-label>
          <input
            matInput
            type="password"
            formControlName="confirmPassword"
            required
          />
          @if (
            passwordForm.get("confirmPassword")?.touched &&
            passwordForm.get("confirmPassword")?.hasError("required")
          ) {
            <mat-error>Please confirm your new password</mat-error>
          }
          @if (
            (passwordForm.get("confirmPassword")?.touched ||
              passwordForm.get("confirmPassword")?.dirty) &&
            passwordForm.get("confirmPassword")?.hasError("passwordMismatch")
          ) {
            <mat-error>Passwords do not match</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="submit()"
        [disabled]="!passwordForm.valid || loading"
      >
        Change Password
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }

      mat-dialog-content {
        min-width: 400px;
        padding: 24px;
      }

      mat-form-field {
        margin-top: 20px;
        margin-bottom: 16px;
        display: block;
      }

      mat-form-field:first-of-type {
        margin-top: 16px;
      }

      mat-dialog-actions {
        padding: 16px 24px;
      }
    `,
  ],
})
export class AdminChangePasswordDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AdminChangePasswordDialogComponent>);
  private usersService = inject(AdminUsersService);
  private snackBar = inject(MatSnackBar);
  data: { userId: number; username: string } = inject(MAT_DIALOG_DATA);

  passwordForm: FormGroup;
  loading = false;

  constructor() {
    this.passwordForm = this.fb.group(
      {
        newPassword: ["", Validators.required],
        confirmPassword: ["", Validators.required],
      },
      { validators: this.passwordMatchValidator.bind(this) },
    );

    this.passwordForm.get("newPassword")?.valueChanges.subscribe(() => {
      this.passwordForm
        .get("confirmPassword")
        ?.updateValueAndValidity({ emitEvent: false });
    });
    this.passwordForm.get("confirmPassword")?.valueChanges.subscribe(() => {
      this.passwordForm.updateValueAndValidity({ emitEvent: false });
    });
  }

  private passwordMatchValidator = (
    control: AbstractControl,
  ): ValidationErrors | null => {
    const newPassword = control.get("newPassword");
    const confirmPassword = control.get("confirmPassword");

    if (!newPassword || !confirmPassword) {
      return null;
    }

    if (!newPassword.value || !confirmPassword.value) {
      if (confirmPassword.hasError("passwordMismatch")) {
        const errors = { ...confirmPassword.errors };
        delete errors["passwordMismatch"];
        confirmPassword.setErrors(
          Object.keys(errors).length > 0 ? errors : null,
        );
      }
      return null;
    }

    if (newPassword.value !== confirmPassword.value) {
      const existingErrors = confirmPassword.errors || {};
      confirmPassword.setErrors({ ...existingErrors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    if (confirmPassword.hasError("passwordMismatch")) {
      const errors = { ...confirmPassword.errors };
      delete errors["passwordMismatch"];
      confirmPassword.setErrors(Object.keys(errors).length > 0 ? errors : null);
    }

    return null;
  };

  submit(): void {
    const newPassword = this.passwordForm.get("newPassword")?.value;
    const confirmPassword = this.passwordForm.get("confirmPassword")?.value;

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      const confirmPasswordControl = this.passwordForm.get("confirmPassword");
      const existingErrors = confirmPasswordControl?.errors || {};
      confirmPasswordControl?.setErrors({
        ...existingErrors,
        passwordMismatch: true,
      });
      confirmPasswordControl?.markAsTouched();
      confirmPasswordControl?.markAsDirty();
      return;
    }

    if (this.passwordForm.valid) {
      this.loading = true;
      this.usersService
        .changePassword(this.data.userId, { newPassword })
        .subscribe({
          next: (response) => {
            this.loading = false;
            if (response && response.success) {
              this.snackBar.open("Password changed successfully", "Close", {
                duration: 3000,
              });
              this.dialogRef.close(true);
            } else {
              this.snackBar.open(
                response?.message || "Failed to change password",
                "Close",
                {
                  duration: 5000,
                },
              );
            }
          },
          error: (error) => {
            this.loading = false;
            const errorMessage =
              error?.error?.message ||
              "Failed to change password. Please try again.";
            this.snackBar.open(errorMessage, "Close", { duration: 5000 });
          },
        });
    } else {
      Object.keys(this.passwordForm.controls).forEach((key) => {
        this.passwordForm.get(key)?.markAsTouched();
      });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
