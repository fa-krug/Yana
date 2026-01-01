/**
 * Profile settings component - user profile form.
 */

import { CommonModule } from "@angular/common";
import { Component, inject, input, output } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

import { UserSettingsService } from "@app/core/services/user-settings.service";

import { ChangePasswordDialogComponent } from "../change-password-dialog.component";

@Component({
  selector: "app-profile-settings",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card class="settings-card">
      <mat-card-header>
        <mat-card-title>Profile</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="profileForm">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>First Name</mat-label>
            <input matInput formControlName="firstName" required />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Last Name</mat-label>
            <input matInput formControlName="lastName" required />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" required />
          </mat-form-field>
        </form>
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-raised-button
          color="primary"
          (click)="updateProfile()"
          [disabled]="!profileForm.valid || loading()"
        >
          Save Profile
        </button>
        <button mat-raised-button (click)="openChangePasswordDialog()">
          Change Password
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      .settings-card {
        margin-bottom: 24px;
      }

      .full-width {
        width: 100%;
        margin-bottom: 16px;
      }
    `,
  ],
})
export class ProfileSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(UserSettingsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = input.required<boolean>();
  readonly profileUpdated = output<void>();

  readonly profileForm: FormGroup = this.fb.group({
    firstName: ["", Validators.required],
    lastName: ["", Validators.required],
    email: ["", [Validators.required, Validators.email]],
  });

  protected updateProfile(): void {
    if (this.profileForm.valid) {
      this.settingsService
        .updateProfile({
          firstName: this.profileForm.value.firstName,
          lastName: this.profileForm.value.lastName,
          email: this.profileForm.value.email,
        })
        .subscribe({
          next: () => {
            this.snackBar.open("Profile updated successfully", "Close", {
              duration: 3000,
              panelClass: ["success-snackbar"],
            });
            this.profileUpdated.emit();
          },
          error: (error) => {
            this.snackBar.open(
              error.error?.message || "Failed to update profile",
              "Close",
              {
                duration: 3000,
              },
            );
          },
        });
    }
  }

  protected openChangePasswordDialog(): void {
    this.dialog.open(ChangePasswordDialogComponent, {
      width: "500px",
    });
  }

  setFormValues(profile: {
    firstName: string;
    lastName: string;
    email: string;
  }): void {
    this.profileForm.patchValue({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
    });
  }
}
