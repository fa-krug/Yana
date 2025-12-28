import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogRef, MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

import { UserSettingsService } from "@app/core/services/user-settings.service";

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

    if (newPassword.value != confirmPassword.value) {
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

    if (newPassword && confirmPassword && newPassword != confirmPassword) {
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

  private extractErrorMessage(error: unknown): string {
    if (typeof error !== "object" || error == null) return String(error);

    const errorBody = (error as { error?: {
      detail?: Array<{ loc?: unknown[]; msg?: string }> | string;
      message?: string;
      non_field_errors?: unknown;
    } }).error;

    if (errorBody && typeof errorBody === "object") {
      const arrayErrorMessage = this._extractArrayErrorMessage(errorBody);
      if (arrayErrorMessage) return arrayErrorMessage;

      const messageObj = errorBody as { message?: unknown };
      if (typeof messageObj.message === "string") return messageObj.message;

      const nonFieldMessage = this._extractNonFieldErrorMessage(errorBody);
      if (nonFieldMessage) return nonFieldMessage;
    }

    if (errorBody && typeof errorBody === "string") return errorBody;
    const topMessage = (error as { message?: string }).message;
    if (typeof topMessage === "string") return topMessage;

    return "Failed to change password. Please check your input and try again.";
  }

  private _extractArrayErrorMessage(
    errorBody: { detail?: Array<{ loc?: unknown[]; msg?: string }> | string; message?: string; non_field_errors?: unknown },
  ): string | null {
    const detail = errorBody.detail;
    if (!Array.isArray(detail)) return null;

    return detail.map((item) => {
      if (typeof item === "string") return item;
      const loc = item.loc;
      const field = loc && Array.isArray(loc) && loc.length > 1 ? String(loc[loc.length - 1]) : "";
      const msg = item.msg || "";
      return field ? `${field}: ${msg}` : msg;
    }).join("; ");
  }

  private _extractNonFieldErrorMessage(
    errorBody: { detail?: Array<{ loc?: unknown[]; msg?: string }> | string; message?: string; non_field_errors?: unknown },
  ): string | null {
    if (typeof errorBody.detail === "string") return errorBody.detail;

    const nonFieldErrors = errorBody.non_field_errors;
    if (!nonFieldErrors) return null;

    return Array.isArray(nonFieldErrors) ? nonFieldErrors.map(String).join(" ") : String(nonFieldErrors);
  }

  /**
   * Check if error message refers to current password.
   */
  private isCurrentPwdError(lowerMsg: string): boolean {
    return lowerMsg.includes("current password") || lowerMsg.includes("current_password") || (lowerMsg.includes("current") && lowerMsg.includes("password"));
  }

  /**
   * Check if error message refers to new password.
   */
  private isNewPwdError(lowerMsg: string): boolean {
    return lowerMsg.includes("new password") || lowerMsg.includes("new_password") || lowerMsg.includes("password do not match") || (lowerMsg.includes("password") && lowerMsg.includes("match"));
  }

  private handleError(message: string): void {
    if (!message) return;
    const lowerMessage = message.toLowerCase();

    if (this.isCurrentPwdError(lowerMessage)) {
      this.currentPasswordError = message;
      const control = this.passwordForm.get("currentPassword");
      if (control) {
        const errors = control.errors || {};
        control.setErrors({ ...errors, serverError: message });
        control.markAsTouched();
        control.markAsDirty();
      }
      this.snackBar.open(message, "Close", { duration: 5000 });
    } else if (this.isNewPwdError(lowerMessage)) {
      if (lowerMessage.includes("confirm") || lowerMessage.includes("match")) {
        this.confirmPasswordError = message;
        this.passwordForm.get("confirmPassword")?.setErrors({ serverError: true });
        this.passwordForm.get("confirmPassword")?.markAsTouched();
      } else {
        this.newPasswordError = message;
        this.passwordForm.get("newPassword")?.setErrors({ serverError: true });
        this.passwordForm.get("newPassword")?.markAsTouched();
      }
    } else {
      this.snackBar.open(message, "Close", { duration: 5000 });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
