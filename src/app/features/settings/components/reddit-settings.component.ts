/**
 * Reddit settings component - Reddit API configuration form.
 */

import { CommonModule } from "@angular/common";
import { Component, inject, input, output } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

import { UserSettingsService } from "@app/core/services/user-settings.service";

@Component({
  selector: "app-reddit-settings",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card class="settings-card">
      <mat-card-header>
        <mat-card-title>Reddit Integration</mat-card-title>
        <mat-card-subtitle
          >Configure Reddit API credentials to enable Reddit
          feeds</mat-card-subtitle
        >
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="redditForm">
          <mat-checkbox formControlName="enabled" class="full-width">
            Enable Reddit Integration
          </mat-checkbox>

          @if (redditForm.get("enabled")?.value) {
            <div class="credentials-section">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Client ID</mat-label>
                <input matInput formControlName="clientId" required />
                @if (redditForm.get("clientId")?.hasError("server")) {
                  <mat-error>{{
                    redditForm.get("clientId")?.getError("server")
                  }}</mat-error>
                } @else if (
                  redditForm.get("clientId")?.touched &&
                  redditForm.get("clientId")?.hasError("required")
                ) {
                  <mat-error>Client ID is required</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Client Secret</mat-label>
                <input
                  matInput
                  [type]="
                    redditForm.get('clientSecret')?.value === '••••••••'
                      ? 'text'
                      : 'password'
                  "
                  formControlName="clientSecret"
                  required
                  [placeholder]="
                    redditForm.get('clientSecret')?.value === '••••••••'
                      ? 'Secret is set (enter new value to change)'
                      : ''
                  "
                />
                @if (redditForm.get("clientSecret")?.hasError("server")) {
                  <mat-error>{{
                    redditForm.get("clientSecret")?.getError("server")
                  }}</mat-error>
                } @else if (
                  redditForm.get("clientSecret")?.touched &&
                  redditForm.get("clientSecret")?.hasError("required")
                ) {
                  <mat-error>Client Secret is required</mat-error>
                } @else if (
                  redditForm.get("clientSecret")?.value === "••••••••"
                ) {
                  <mat-hint
                    >Leave unchanged to keep existing secret, or enter a new
                    value</mat-hint
                  >
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>User Agent</mat-label>
                <input matInput formControlName="userAgent" />
                @if (redditForm.get("userAgent")?.hasError("server")) {
                  <mat-error>{{
                    redditForm.get("userAgent")?.getError("server")
                  }}</mat-error>
                }
              </mat-form-field>

              <div class="help-text">
                <h4>How to get Reddit credentials:</h4>
                <ol>
                  <li>
                    Go to
                    <a href="https://www.reddit.com/prefs/apps" target="_blank"
                      >Reddit Apps</a
                    >
                  </li>
                  <li>Click "create another app..."</li>
                  <li>Select "script" as app type</li>
                  <li>Fill in name (e.g., "Yana")</li>
                  <li>Set redirect URI to http://localhost:8000</li>
                  <li>Click "create app"</li>
                  <li>Client ID: string under "personal use script"</li>
                  <li>Client Secret: string next to "secret"</li>
                </ol>
              </div>
            </div>
          }
        </form>
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-raised-button
          color="primary"
          (click)="updateRedditSettings()"
          [disabled]="loading()"
        >
          Save Reddit Settings
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

      .credentials-section {
        margin-top: 16px;
      }

      .help-text {
        margin-top: 24px;
        padding: 16px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 8px;
      }

      .help-text h4 {
        margin: 0 0 12px 0;
        font-size: 1rem;
        font-weight: 500;
      }

      .help-text ol {
        margin: 0;
        padding-left: 20px;
      }

      .help-text li {
        margin: 8px 0;
      }

      .help-text a {
        color: var(--mat-sys-primary);
        text-decoration: none;
      }

      .help-text a:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class RedditSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(UserSettingsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = input.required<boolean>();
  readonly settingsUpdated = output<void>();

  readonly redditForm: FormGroup = this.fb.group({
    enabled: [false],
    clientId: [""],
    clientSecret: [""],
    userAgent: ["Yana/1.0"],
  });

  protected updateRedditSettings(): void {
    if (this.redditForm.valid) {
      this.clearRedditFieldErrors();

      const formValue = this.redditForm.value;
      const clientSecret =
        formValue.clientSecret === "••••••••" ? "" : formValue.clientSecret;

      this.settingsService
        .updateRedditSettings({
          enabled: formValue.enabled,
          client_id: formValue.clientId,
          client_secret: clientSecret,
          user_agent: formValue.userAgent || "Yana/1.0",
        })
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open(
                "Reddit settings updated successfully",
                "Close",
                {
                  duration: 3000,
                  panelClass: ["success-snackbar"],
                },
              );
              this.settingsUpdated.emit();
            } else {
              this.snackBar.open(response.message, "Close", { duration: 5000 });
            }
          },
          error: (error) => {
            const fieldErrors = this.extractRedditFieldErrors(error);
            let errorMessage = "Failed to update Reddit settings";

            if (fieldErrors) {
              errorMessage =
                fieldErrors.general ||
                fieldErrors.clientId ||
                fieldErrors.clientSecret ||
                fieldErrors.userAgent ||
                errorMessage;
            } else {
              errorMessage = this.extractRedditErrorMessage(error);
            }

            this.snackBar.open(errorMessage, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            });
          },
        });
    }
  }

  private clearRedditFieldErrors(): void {
    this.redditForm.get("clientId")?.setErrors(null);
    this.redditForm.get("clientSecret")?.setErrors(null);
    this.redditForm.get("userAgent")?.setErrors(null);
  }

  private extractRedditFieldErrors(error: unknown): {
    clientId?: string;
    clientSecret?: string;
    userAgent?: string;
    general?: string;
  } | null {
    const getNestedValue = (obj: unknown, ...paths: string[]): unknown => {
      for (const path of paths) {
        if (typeof obj === "object" && obj !== null && path in obj) {
          obj = (obj as Record<string, unknown>)[path];
        } else {
          return undefined;
        }
      }
      return obj;
    };

    let fieldErrors =
      getNestedValue(error, "data", "fieldErrors") ||
      getNestedValue(error, "shape", "data", "fieldErrors");

    if (!fieldErrors) {
      const cause = getNestedValue(error, "data", "cause");
      if (
        cause &&
        typeof cause === "object" &&
        ("clientId" in cause || "clientSecret" in cause || "general" in cause)
      ) {
        fieldErrors = cause;
      }
    }

    if (
      fieldErrors &&
      typeof fieldErrors === "object" &&
      fieldErrors !== null
    ) {
      const err = fieldErrors as Record<string, unknown>;
      return {
        clientId:
          typeof err["clientId"] === "string" ? err["clientId"] : undefined,
        clientSecret:
          typeof err["clientSecret"] === "string"
            ? err["clientSecret"]
            : undefined,
        userAgent:
          typeof err["userAgent"] === "string" ? err["userAgent"] : undefined,
        general:
          typeof err["general"] === "string" ? err["general"] : undefined,
      };
    }

    return null;
  }

  private extractRedditErrorMessage(error: unknown): string {
    if (
      typeof error === "object" &&
      error !== null &&
      "data" in error &&
      typeof (error as { data?: unknown }).data === "object" &&
      (error as { data?: { message?: unknown } }).data !== null &&
      "message" in (error as { data: { message?: unknown } }).data &&
      typeof (error as { data: { message: unknown } }).data.message === "string"
    ) {
      return (error as { data: { message: string } }).data.message;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "error" in error &&
      typeof (error as { error?: unknown }).error === "object" &&
      (error as { error?: { message?: unknown } }).error !== null &&
      "message" in (error as { error: { message?: unknown } }).error &&
      typeof (error as { error: { message: unknown } }).error.message ===
        "string"
    ) {
      return (error as { error: { message: string } }).error.message;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
    return "Failed to update Reddit settings";
  }

  setFormValues(settings: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    userAgent: string;
  }): void {
    this.redditForm.patchValue({
      enabled: settings.enabled,
      clientId: settings.clientId,
      clientSecret:
        settings.clientSecret || (settings.enabled ? "••••••••" : ""),
      userAgent: settings.userAgent,
    });
  }
}
