/**
 * YouTube settings component - YouTube API configuration form.
 */

import { Component, inject, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { UserSettingsService } from "@app/core/services/user-settings.service";

@Component({
  selector: "app-youtube-settings",
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
        <mat-card-title>YouTube Integration</mat-card-title>
        <mat-card-subtitle
          >Configure YouTube API key to enable YouTube channel
          feeds</mat-card-subtitle
        >
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="youtubeForm">
          <mat-checkbox formControlName="enabled" class="full-width">
            Enable YouTube Integration
          </mat-checkbox>

          @if (youtubeForm.get("enabled")?.value) {
            <div class="credentials-section">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>API Key</mat-label>
                <input
                  matInput
                  [type]="
                    youtubeForm.get('apiKey')?.value === '••••••••'
                      ? 'text'
                      : 'password'
                  "
                  formControlName="apiKey"
                  required
                  [placeholder]="
                    youtubeForm.get('apiKey')?.value === '••••••••'
                      ? 'API key is set (enter new value to change)'
                      : ''
                  "
                />
                @if (youtubeForm.get("apiKey")?.hasError("server")) {
                  <mat-error>{{
                    youtubeForm.get("apiKey")?.getError("server")
                  }}</mat-error>
                } @else if (
                  youtubeForm.get("apiKey")?.touched &&
                  youtubeForm.get("apiKey")?.hasError("required")
                ) {
                  <mat-error>API Key is required</mat-error>
                } @else if (youtubeForm.get("apiKey")?.value === "••••••••") {
                  <mat-hint
                    >Leave unchanged to keep existing key, or enter a new
                    value</mat-hint
                  >
                }
              </mat-form-field>

              <div class="help-text">
                <h4>How to get YouTube API key:</h4>
                <ol>
                  <li>
                    Go to
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      >Google Cloud Console</a
                    >
                  </li>
                  <li>Create a new project or select existing</li>
                  <li>Enable "YouTube Data API v3"</li>
                  <li>Create credentials → API Key</li>
                  <li>Copy the API key</li>
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
          (click)="updateYouTubeSettings()"
          [disabled]="loading()"
        >
          Save YouTube Settings
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
export class YouTubeSettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(UserSettingsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = input.required<boolean>();
  readonly settingsUpdated = output<void>();

  readonly youtubeForm: FormGroup = this.fb.group({
    enabled: [false],
    apiKey: [""],
  });

  protected updateYouTubeSettings(): void {
    if (this.youtubeForm.valid) {
      this.clearYouTubeFieldErrors();

      const formValue = this.youtubeForm.value;
      const apiKey = formValue.apiKey === "••••••••" ? "" : formValue.apiKey;

      this.settingsService
        .updateYouTubeSettings({
          enabled: formValue.enabled,
          api_key: apiKey,
        })
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open(
                "YouTube settings updated successfully",
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
            const fieldErrors = this.extractYouTubeFieldErrors(error);
            let errorMessage = "Failed to update YouTube settings";

            if (fieldErrors) {
              errorMessage =
                fieldErrors.general || fieldErrors.apiKey || errorMessage;
            } else {
              errorMessage = this.extractYouTubeErrorMessage(error);
            }

            this.snackBar.open(errorMessage, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            });
          },
        });
    }
  }

  private clearYouTubeFieldErrors(): void {
    this.youtubeForm.get("apiKey")?.setErrors(null);
  }

  private extractYouTubeFieldErrors(error: unknown): {
    apiKey?: string;
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

    const fieldErrors =
      getNestedValue(error, "data", "fieldErrors") ||
      getNestedValue(error, "shape", "data", "fieldErrors") ||
      getNestedValue(error, "data", "cause") ||
      getNestedValue(error, "shape", "data", "cause");

    if (
      fieldErrors &&
      typeof fieldErrors === "object" &&
      fieldErrors !== null
    ) {
      const hasFieldErrors =
        "apiKey" in fieldErrors || "general" in fieldErrors;

      if (hasFieldErrors) {
        const err = fieldErrors as Record<string, unknown>;
        return {
          apiKey: typeof err["apiKey"] === "string" ? err["apiKey"] : undefined,
          general:
            typeof err["general"] === "string" ? err["general"] : undefined,
        };
      }
    }

    return null;
  }

  private extractYouTubeErrorMessage(error: unknown): string {
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
    return "Failed to update YouTube settings";
  }

  setFormValues(settings: { enabled: boolean; apiKey: string }): void {
    this.youtubeForm.patchValue({
      enabled: settings.enabled,
      apiKey: settings.apiKey || (settings.enabled ? "••••••••" : ""),
    });
  }
}
