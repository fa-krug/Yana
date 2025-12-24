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
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatDialogRef, MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

import { AdminUsersService } from "@app/core/services/admin-users.service";

@Component({
  selector: "app-user-create-dialog",
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
  ],
  template: `
    <h2 mat-dialog-title>Create User</h2>
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
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password" required />
          @if (
            userForm.get("password")?.touched &&
            userForm.get("password")?.hasError("required")
          ) {
            <mat-error>Password is required</mat-error>
          }
          @if (
            userForm.get("password")?.touched &&
            userForm.get("password")?.hasError("minlength")
          ) {
            <mat-error>Password must be at least 8 characters</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Confirm Password</mat-label>
          <input
            matInput
            type="password"
            formControlName="confirmPassword"
            required
          />
          @if (
            userForm.get("confirmPassword")?.touched &&
            userForm.get("confirmPassword")?.hasError("required")
          ) {
            <mat-error>Please confirm your password</mat-error>
          }
          @if (
            (userForm.get("confirmPassword")?.touched ||
              userForm.get("confirmPassword")?.dirty) &&
            userForm.get("confirmPassword")?.hasError("passwordMismatch")
          ) {
            <mat-error>Passwords do not match</mat-error>
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
        Create
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

      /* Mobile-friendly dialog sizing */
      @media (max-width: 768px) {
        :host ::ng-deep .mat-mdc-dialog-surface {
          width: calc(100vw - 8px) !important;
          max-width: calc(100vw - 8px) !important;
          min-width: 0 !important;
          margin: 0 4px !important;
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
export class UserCreateDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UserCreateDialogComponent>);
  private usersService = inject(AdminUsersService);
  private snackBar = inject(MatSnackBar);

  userForm: FormGroup;
  loading = false;

  constructor() {
    this.userForm = this.fb.group(
      {
        username: ["", [Validators.required, Validators.minLength(3)]],
        email: ["", [Validators.required, Validators.email]],
        password: ["", [Validators.required, Validators.minLength(8)]],
        confirmPassword: ["", [Validators.required]],
        firstName: [""],
        lastName: [""],
        isSuperuser: [false],
      },
      { validators: this.passwordMatchValidator.bind(this) },
    );

    this.userForm.get("password")?.valueChanges.subscribe(() => {
      this.userForm
        .get("confirmPassword")
        ?.updateValueAndValidity({ emitEvent: false });
    });
    this.userForm.get("confirmPassword")?.valueChanges.subscribe(() => {
      this.userForm.updateValueAndValidity({ emitEvent: false });
    });
  }

  private passwordMatchValidator = (
    control: AbstractControl,
  ): ValidationErrors | null => {
    const password = control.get("password");
    const confirmPassword = control.get("confirmPassword");

    if (!password || !confirmPassword) {
      return null;
    }

    if (!password.value || !confirmPassword.value) {
      if (confirmPassword.hasError("passwordMismatch")) {
        const errors = { ...confirmPassword.errors };
        delete errors["passwordMismatch"];
        confirmPassword.setErrors(
          Object.keys(errors).length > 0 ? errors : null,
        );
      }
      return null;
    }

    if (password.value !== confirmPassword.value) {
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
    const password = this.userForm.get("password")?.value;
    const confirmPassword = this.userForm.get("confirmPassword")?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      const confirmPasswordControl = this.userForm.get("confirmPassword");
      const existingErrors = confirmPasswordControl?.errors || {};
      confirmPasswordControl?.setErrors({
        ...existingErrors,
        passwordMismatch: true,
      });
      confirmPasswordControl?.markAsTouched();
      confirmPasswordControl?.markAsDirty();
      return;
    }

    if (this.userForm.valid) {
      this.loading = true;
      const formValue = this.userForm.value;
      const { confirmPassword: _confirmPassword, ...userData } = formValue;
      this.usersService.createUser(userData).subscribe({
        next: () => {
          this.loading = false;
          this.snackBar.open("User created successfully", "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.loading = false;
          const errorMessage = error?.error?.message || "Failed to create user";
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
}
