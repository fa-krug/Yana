/**
 * Login component with Material Design form.
 *
 * @component
 * @standalone
 *
 * Features:
 * - Username/password authentication
 * - Form validation with error messages
 * - Loading state during authentication
 * - Redirects to return URL after successful login
 */

// Angular core
import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";

// Angular Material
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatIconModule } from "@angular/material/icon";

// Application
import { HeaderComponent } from "@app/layouts/header.component";
import { AuthService } from "@app/core/services/auth.service";
import { LoginResponse } from "@app/core/models";

@Component({
  selector: "app-login",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatIconModule,
    HeaderComponent,
  ],
  template: `
    <div class="login-wrapper animate-fade-in">
      <app-header toolbarClass="login-header" />

      <div class="login-container">
        <mat-card class="login-card animate-slide-up">
          <mat-card-header>
            <mat-card-title>Sign in to continue</mat-card-title>
          </mat-card-header>

          <mat-card-content>
            <form
              [formGroup]="loginForm"
              (ngSubmit)="onSubmit()"
              class="login-form"
            >
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Username</mat-label>
                <mat-icon matPrefix>person</mat-icon>
                <input
                  matInput
                  formControlName="username"
                  autocomplete="username"
                  required
                />
                @if (
                  loginForm.get("username")?.hasError("required") &&
                  loginForm.get("username")?.touched
                ) {
                  <mat-error>Username is required</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Password</mat-label>
                <mat-icon matPrefix>lock</mat-icon>
                <input
                  matInput
                  type="password"
                  formControlName="password"
                  autocomplete="current-password"
                  required
                />
                @if (
                  loginForm.get("password")?.hasError("required") &&
                  loginForm.get("password")?.touched
                ) {
                  <mat-error>Password is required</mat-error>
                }
              </mat-form-field>

              @if (errorMessage()) {
                <div class="error-message">
                  <mat-icon>error</mat-icon>
                  <span>{{ errorMessage() }}</span>
                </div>
              }

              <button
                mat-raised-button
                color="primary"
                type="submit"
                class="full-width submit-button"
                [disabled]="loginForm.invalid || loading()"
                [attr.aria-busy]="loading()"
              >
                @if (loading()) {
                  <span class="button-content">
                    <mat-spinner diameter="20" aria-hidden="true"></mat-spinner>
                    <span>Signing in...</span>
                  </span>
                } @else {
                  <span class="button-content">
                    <span>Sign In</span>
                    <mat-icon>arrow_forward</mat-icon>
                  </span>
                }
              </button>
            </form>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [
    `
      .login-wrapper {
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
      }

      .login-header {
        flex-shrink: 0;
      }

      .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        flex: 1;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 24px;
        overflow-y: auto;
        position: relative;
      }

      .login-container::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background:
          radial-gradient(
            circle at 20% 50%,
            rgba(255, 255, 255, 0.1) 0%,
            transparent 50%
          ),
          radial-gradient(
            circle at 80% 80%,
            rgba(255, 255, 255, 0.1) 0%,
            transparent 50%
          );
        pointer-events: none;
      }

      .login-card {
        max-width: 440px;
        width: 100%;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        position: relative;
        z-index: 1;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(10px);
      }

      :host-context(.dark-theme) .login-card {
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      mat-card-header {
        padding: 32px 32px 24px 32px;
        text-align: center;
        background: linear-gradient(
          135deg,
          rgba(102, 126, 234, 0.05) 0%,
          rgba(118, 75, 162, 0.05) 100%
        );
      }

      :host-context(.dark-theme) mat-card-header {
        background: linear-gradient(
          135deg,
          rgba(102, 126, 234, 0.1) 0%,
          rgba(118, 75, 162, 0.1) 100%
        );
      }

      mat-card-title {
        font-size: 1.75rem !important;
        font-weight: 600 !important;
        color: var(--mat-sys-on-surface) !important;
        letter-spacing: -0.02em;
        margin: 0 !important;
      }

      mat-card-content {
        padding: 32px !important;
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .full-width {
        width: 100%;
      }

      mat-form-field {
        margin-bottom: 0;
      }

      mat-form-field mat-icon[matPrefix] {
        margin-right: 12px;
        color: rgba(0, 0, 0, 0.6);
        opacity: 0.7;
      }

      :host-context(.dark-theme) mat-form-field mat-icon[matPrefix] {
        color: rgba(255, 255, 255, 0.8) !important;
        opacity: 1;
      }

      mat-form-field.mat-focused mat-icon[matPrefix] {
        color: var(--mat-sys-primary);
        opacity: 1;
      }

      .submit-button {
        margin-top: 8px;
        height: 48px;
        font-size: 1rem;
        font-weight: 500;
        border-radius: 8px;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 8px;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        padding: 0 24px !important;
      }

      .submit-button:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
      }

      .submit-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .submit-button mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        margin: 0 !important;
        line-height: 1 !important;
        vertical-align: middle;
      }

      .submit-button span {
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }

      .submit-button mat-spinner {
        margin: 0 !important;
        flex-shrink: 0;
      }

      .button-content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .error-message {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #d32f2f;
        margin-bottom: 8px;
        padding: 12px 16px;
        background-color: #ffebee;
        border-radius: 8px;
        font-size: 0.875rem;
        border-left: 4px solid #d32f2f;
        animation: shake 0.3s ease-in-out;
      }

      @keyframes shake {
        0%,
        100% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-8px);
        }
        75% {
          transform: translateX(8px);
        }
      }

      .error-message mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      :host-context(.dark-theme) .error-message {
        color: #ffcdd2;
        background-color: rgba(211, 47, 47, 0.15);
        border-left-color: #ff5252;
      }

      /* Responsive design */
      @media (max-width: 600px) {
        .login-container {
          padding: 16px;
        }

        mat-card-header {
          padding: 24px 24px 20px 24px;
        }

        mat-card-content {
          padding: 24px !important;
        }

        mat-card-title {
          font-size: 1.5rem !important;
        }

        .login-card {
          max-width: 100%;
        }
      }

      /* Improve form field styling */
      ::ng-deep .mat-mdc-form-field {
        --mdc-outlined-text-field-container-shape: 8px;
      }

      ::ng-deep .mat-mdc-form-field.mat-focused .mat-mdc-text-field-wrapper {
        --mdc-outlined-text-field-focus-outline-color: var(--mat-sys-primary);
      }

      /* Dark mode form field improvements */
      :host-context(.dark-theme) {
        ::ng-deep .mat-mdc-form-field {
          --mdc-outlined-text-field-outline-color: rgba(255, 255, 255, 0.3);
          --mdc-outlined-text-field-label-text-color: rgba(255, 255, 255, 0.7);
        }

        // Form fields use global CSS variables
      }
    `,
  ],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

  loading = this.authService.loading;
  errorMessage = signal<string>("");

  loginForm = this.fb.nonNullable.group({
    username: ["", Validators.required],
    password: ["", Validators.required],
  });

  onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.errorMessage.set("");
    const credentials = this.loginForm.getRawValue();

    this.authService.login(credentials).subscribe({
      next: (response: LoginResponse | null) => {
        if (response?.success) {
          this.snackBar.open("Login successful!", "Close", {
            duration: 3000,
            panelClass: ["success-snackbar"],
          });

          // Get return URL from query params or default to '/'
          const returnUrl = this.route.snapshot.queryParams["returnUrl"] || "/";
          this.router.navigateByUrl(returnUrl);
        } else {
          this.errorMessage.set(response?.message || "Login failed");
        }
      },
      error: (error: unknown) => {
        console.error("Login error:", error);
        this.errorMessage.set("Invalid username or password");
      },
    });
  }
}
