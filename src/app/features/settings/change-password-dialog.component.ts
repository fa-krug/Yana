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
import { MatDialogRef, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { UserSettingsService } from "../../core/services/user-settings.service";

@Component({
  selector: "app-change-password-dialog",
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
    <h2 mat-dialog-title>Change Password</h2>
    <mat-dialog-content>
      <form [formGroup]="passwordForm">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Current Password</mat-label>
          <input
            matInput
            type="password"
            formControlName="currentPassword"
            required
          />
          @if (currentPasswordError) {
            <mat-error>{{ currentPasswordError }}</mat-error>
          } @else if (
            passwordForm.get("currentPassword")?.touched &&
            passwordForm.get("currentPassword")?.hasError("required")
          ) {
            <mat-error>Current password is required</mat-error>
          }
        </mat-form-field>

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
          @if (newPasswordError) {
            <mat-error>{{ newPasswordError }}</mat-error>
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
          @if (confirmPasswordError) {
            <mat-error>{{ confirmPasswordError }}</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions class="dialog-actions">
      <button
        class="primary-button"
        (click)="submit()"
        [disabled]="!passwordForm.valid || loading"
      >
        Change Password
      </button>
      <button class="secondary-button" (click)="cancel()">Cancel</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 100%;
      }

      :host ::ng-deep .mat-mdc-dialog-surface {
        width: min(520px, calc(100vw - 32px));
        max-width: 100%;
        margin: 0 auto;
      }

      :host ::ng-deep .cdk-global-overlay-wrapper {
        align-items: center;
        padding: 24px 0;
      }

      .full-width {
        width: 100%;
      }

      mat-dialog-content {
        min-width: 400px;
        padding: 24px;
        box-sizing: border-box;
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
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        width: 100%;
      }

      .primary-button {
        width: 100%;
        max-width: 440px;
        background-color: #2196f3;
        color: #ffffff;
        border: none;
        border-radius: 10px;
        padding: 12px 18px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0px 3px 6px rgba(0, 0, 0, 0.22);
        transition:
          background-color 0.2s,
          box-shadow 0.2s,
          transform 0.1s;
      }

      .primary-button:hover:not(:disabled) {
        background-color: #1e88e5;
        box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.24);
      }

      .primary-button:active:not(:disabled) {
        background-color: #1976d2;
        box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.2);
        transform: translateY(1px);
      }

      .primary-button:disabled {
        background-color: #5e5e5e;
        color: #ffffff;
        cursor: not-allowed;
        box-shadow: none;
        opacity: 0.9;
      }

      .secondary-button {
        background: transparent;
        color: #ffffff;
        border: none;
        padding: 6px 12px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        text-align: center;
        transition: opacity 0.2s;
      }

      :host-context(:not(.dark-theme)) .secondary-button {
        color: #1f1f1f;
      }

      :host-context(.dark-theme) .secondary-button {
        color: #ffffff !important;
      }

      .secondary-button:hover {
        opacity: 0.8;
      }

      .secondary-button:active {
        opacity: 0.6;
      }

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
          width: 100%;
          max-width: 100%;
          padding: 16px;
        }

        mat-dialog-actions {
          padding: 12px 16px;
          gap: 10px;
        }

        .primary-button {
          padding: 12px 16px;
          font-size: 15px;
          max-width: 100%;
        }

        .secondary-button {
          padding: 8px 12px;
          font-size: 15px;
        }

        mat-form-field {
          margin-top: 12px;
          margin-bottom: 12px;
        }
      }
    `,
  ],
})
export class ChangePasswordDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ChangePasswordDialogComponent>);
  private settingsService = inject(UserSettingsService);
  private snackBar = inject(MatSnackBar);

  passwordForm: FormGroup;
  loading = false;
  currentPasswordError: string | null = null;
  newPasswordError: string | null = null;
  confirmPasswordError: string | null = null;

  constructor() {
    this.passwordForm = this.fb.group(
      {
        currentPassword: ["", Validators.required],
        newPassword: ["", Validators.required],
        confirmPassword: ["", Validators.required],
      },
      { validators: this.passwordMatchValidator.bind(this) },
    );

    // Update validation when passwords change
    this.passwordForm.get("newPassword")?.valueChanges.subscribe(() => {
      this.passwordForm
        .get("confirmPassword")
        ?.updateValueAndValidity({ emitEvent: false });
    });
    this.passwordForm.get("confirmPassword")?.valueChanges.subscribe(() => {
      // Trigger form-level validator to check password match
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

    // Only validate if both fields have values
    if (!newPassword.value || !confirmPassword.value) {
      // Clear mismatch error if one field is empty
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
      // Set error on confirmPassword field
      const existingErrors = confirmPassword.errors || {};
      confirmPassword.setErrors({ ...existingErrors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    // Clear the error if passwords match
    if (confirmPassword.hasError("passwordMismatch")) {
      const errors = { ...confirmPassword.errors };
      delete errors["passwordMismatch"];
      confirmPassword.setErrors(Object.keys(errors).length > 0 ? errors : null);
    }

    return null;
  };

  submit(): void {
    // Check for password mismatch before validating
    const newPassword = this.passwordForm.get("newPassword")?.value;
    const confirmPassword = this.passwordForm.get("confirmPassword")?.value;
    const confirmPasswordControl = this.passwordForm.get("confirmPassword");

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      const existingErrors = confirmPasswordControl?.errors || {};
      confirmPasswordControl?.setErrors({
        ...existingErrors,
        passwordMismatch: true,
      });
      confirmPasswordControl?.markAsTouched();
      confirmPasswordControl?.markAsDirty();
      // Also mark newPassword as touched to provide context
      this.passwordForm.get("newPassword")?.markAsTouched();
      return;
    }

    if (this.passwordForm.valid) {
      // Clear previous errors
      this.clearFieldErrors();

      this.loading = true;
      // Transform camelCase form fields to snake_case for API
      const formData = {
        current_password: this.passwordForm.get("currentPassword")?.value || "",
        new_password: this.passwordForm.get("newPassword")?.value || "",
        confirm_password: this.passwordForm.get("confirmPassword")?.value || "",
      };
      this.settingsService.changePassword(formData).subscribe({
        next: (response) => {
          this.loading = false;
          if (response && response.success) {
            this.snackBar.open("Password changed successfully", "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.dialogRef.close(true);
          } else {
            // Handle error response - could be success: false or HTTP error
            const errorMessage =
              response?.message || "An error occurred while changing password";
            this.handleError(errorMessage);
          }
        },
        error: (error) => {
          this.loading = false;
          // HTTP error (4xx, 5xx) - extract message from error response
          const errorMessage = this.extractErrorMessage(error);
          this.handleError(errorMessage);
        },
      });
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.passwordForm.controls).forEach((key) => {
        this.passwordForm.get(key)?.markAsTouched();
      });
    }
  }

  private clearFieldErrors(): void {
    this.currentPasswordError = null;
    this.newPasswordError = null;
    this.confirmPasswordError = null;
  }

  private extractErrorMessage(error: any): string {
    // Try to extract detailed error message from various error response formats

    // API validation errors (422) - format: { "detail": [...] }
    if (error?.error?.detail) {
      if (Array.isArray(error.error.detail)) {
        // Format: [{"loc": ["body", "field"], "msg": "message", "type": "type"}]
        const messages = error.error.detail.map((item: any) => {
          if (typeof item === "string") {
            return item;
          }
          if (item?.msg) {
            const field =
              item.loc && item.loc.length > 1
                ? item.loc[item.loc.length - 1]
                : "";
            return field ? `${field}: ${item.msg}` : item.msg;
          }
          return JSON.stringify(item);
        });
        return messages.join("; ");
      }
      if (typeof error.error.detail === "string") {
        return error.error.detail;
      }
    }

    // Standard message format
    if (error?.error?.message) {
      return error.error.message;
    }

    // Non-field errors
    if (error?.error?.non_field_errors) {
      return Array.isArray(error.error.non_field_errors)
        ? error.error.non_field_errors.join(" ")
        : error.error.non_field_errors;
    }

    // String error
    if (typeof error?.error === "string") {
      return error.error;
    }

    // Top-level message
    if (error?.message) {
      return error.message;
    }

    // Default fallback
    return "Failed to change password. Please check your input and try again.";
  }

  private handleError(message: string): void {
    if (!message) {
      return;
    }

    // Map error messages to specific fields
    const lowerMessage = message.toLowerCase();

    // Check for current password errors
    // Match: "Current password is incorrect", "current_password", etc.
    const isCurrentPasswordError =
      lowerMessage.includes("current password") ||
      lowerMessage.includes("current_password") ||
      (lowerMessage.includes("current") && lowerMessage.includes("password"));

    if (isCurrentPasswordError) {
      // Set the error message
      this.currentPasswordError = message;

      // Mark the form control as invalid
      const currentPasswordControl = this.passwordForm.get("currentPassword");
      if (currentPasswordControl) {
        // Set error to make control invalid - preserve required error if needed
        const existingErrors = currentPasswordControl.errors || {};
        currentPasswordControl.setErrors({
          ...existingErrors,
          serverError: message,
        });
        currentPasswordControl.markAsTouched();
        currentPasswordControl.markAsDirty();
      }

      // Also show in snackbar as backup to ensure user sees it
      this.snackBar.open(message, "Close", { duration: 5000 });
    } else if (
      lowerMessage.includes("new password") ||
      lowerMessage.includes("new_password") ||
      lowerMessage.includes("password do not match") ||
      (lowerMessage.includes("password") && lowerMessage.includes("match"))
    ) {
      if (lowerMessage.includes("confirm") || lowerMessage.includes("match")) {
        this.confirmPasswordError = message;
        this.passwordForm
          .get("confirmPassword")
          ?.setErrors({ serverError: true });
        this.passwordForm.get("confirmPassword")?.markAsTouched();
      } else {
        this.newPasswordError = message;
        this.passwordForm.get("newPassword")?.setErrors({ serverError: true });
        this.passwordForm.get("newPassword")?.markAsTouched();
      }
    } else {
      // Show error in snackbar for unmatched errors (fallback)
      // This ensures we always show the error even if field mapping fails
      this.snackBar.open(message, "Close", { duration: 5000 });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
