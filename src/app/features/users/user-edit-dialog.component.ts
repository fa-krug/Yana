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
import {
  AdminUsersService,
  User,
} from "../../core/services/admin-users.service";

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
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        (click)="submit()"
        [disabled]="!userForm.valid || loading"
      >
        Save
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

      mat-dialog-actions {
        padding: 16px 24px;
      }
    `,
  ],
})
export class UserEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UserEditDialogComponent>);
  private usersService = inject(AdminUsersService);
  private snackBar = inject(MatSnackBar);
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
}
