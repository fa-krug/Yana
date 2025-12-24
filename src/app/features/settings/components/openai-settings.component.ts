/**
 * OpenAI settings component - OpenAI API configuration form.
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
  selector: "app-openai-settings",
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
        <mat-card-title>OpenAI Integration</mat-card-title>
        <mat-card-subtitle
          >Configure OpenAI API for AI-powered features (translation,
          summarization)</mat-card-subtitle
        >
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="openaiForm">
          <mat-checkbox formControlName="enabled" class="full-width">
            Enable OpenAI Integration
          </mat-checkbox>

          @if (openaiForm.get("enabled")?.value) {
            <div class="credentials-section">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>API URL</mat-label>
                <input matInput formControlName="apiUrl" required />
                @if (openaiForm.get("apiUrl")?.hasError("server")) {
                  <mat-error>{{
                    openaiForm.get("apiUrl")?.getError("server")
                  }}</mat-error>
                } @else if (
                  openaiForm.get("apiUrl")?.touched &&
                  openaiForm.get("apiUrl")?.hasError("required")
                ) {
                  <mat-error>API URL is required</mat-error>
                } @else {
                  <mat-hint
                    >For OpenAI use https://api.openai.com/v1, or use compatible
                    API (Ollama, LM Studio)</mat-hint
                  >
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>API Key</mat-label>
                <input
                  matInput
                  [type]="
                    openaiForm.get('apiKey')?.value === '••••••••'
                      ? 'text'
                      : 'password'
                  "
                  formControlName="apiKey"
                  required
                  [placeholder]="
                    openaiForm.get('apiKey')?.value === '••••••••'
                      ? 'API key is set (enter new value to change)'
                      : ''
                  "
                />
                @if (openaiForm.get("apiKey")?.hasError("server")) {
                  <mat-error>{{
                    openaiForm.get("apiKey")?.getError("server")
                  }}</mat-error>
                } @else if (
                  openaiForm.get("apiKey")?.touched &&
                  openaiForm.get("apiKey")?.hasError("required")
                ) {
                  <mat-error>API Key is required</mat-error>
                } @else if (openaiForm.get("apiKey")?.value === "••••••••") {
                  <mat-hint
                    >Leave unchanged to keep existing key, or enter a new
                    value</mat-hint
                  >
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Model</mat-label>
                <input matInput formControlName="model" />
                <mat-hint>e.g., gpt-4o-mini, gpt-4, gpt-3.5-turbo</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Temperature</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="temperature"
                  step="0.1"
                  min="0"
                  max="2"
                />
                <mat-hint>0.0-2.0 (lower = more deterministic)</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Max Tokens</mat-label>
                <input matInput type="number" formControlName="maxTokens" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Daily Request Limit</mat-label>
                <input matInput type="number" formControlName="dailyLimit" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Monthly Request Limit</mat-label>
                <input matInput type="number" formControlName="monthlyLimit" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Request Timeout (seconds)</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="requestTimeout"
                  min="10"
                  max="600"
                />
                <mat-hint
                  >Timeout for AI API requests (default: 120 seconds)</mat-hint
                >
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Max Retries</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="maxRetries"
                  min="1"
                  max="10"
                />
                <mat-hint>Maximum number of retry attempts on failure</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Retry Delay (seconds)</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="retryDelay"
                  min="1"
                  max="60"
                />
                <mat-hint
                  >Base delay between retries (exponential backoff)</mat-hint
                >
              </mat-form-field>

              <div class="help-text">
                <h4>How to get OpenAI API key:</h4>
                <ol>
                  <li>
                    Go to
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      >OpenAI API Keys</a
                    >
                  </li>
                  <li>Sign up or log in</li>
                  <li>Click "Create new secret key"</li>
                  <li>Copy the API key (starts with sk-)</li>
                  <li>Add billing information to your OpenAI account</li>
                </ol>
                <p>
                  <strong>Note:</strong> You can also use OpenAI-compatible APIs
                  like Ollama or LM Studio by changing the API URL.
                </p>
              </div>
            </div>
          }
        </form>
      </mat-card-content>
      <mat-card-actions>
        <button
          mat-raised-button
          color="primary"
          (click)="updateOpenAISettings()"
          [disabled]="loading()"
        >
          Save OpenAI Settings
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

      .help-text p {
        margin: 16px 0 0 0;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class OpenAISettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(UserSettingsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = input.required<boolean>();
  readonly settingsUpdated = output<void>();

  readonly openaiForm: FormGroup = this.fb.group({
    enabled: [false],
    apiUrl: ["https://api.openai.com/v1"],
    apiKey: [""],
    model: ["gpt-4o-mini"],
    temperature: [0.3],
    maxTokens: [2000],
    dailyLimit: [200],
    monthlyLimit: [2000],
    maxPromptLength: [500],
    requestTimeout: [120],
    maxRetries: [3],
    retryDelay: [2],
  });

  protected updateOpenAISettings(): void {
    if (this.openaiForm.valid) {
      this.clearOpenAIFieldErrors();

      const formValue = this.openaiForm.value;
      const apiKey = formValue.apiKey === "••••••••" ? "" : formValue.apiKey;

      this.settingsService
        .updateOpenAISettings({
          enabled: formValue.enabled,
          api_url: formValue.apiUrl,
          api_key: apiKey,
          model: formValue.model,
          temperature: formValue.temperature,
          max_tokens: formValue.maxTokens,
          daily_limit: formValue.dailyLimit,
          monthly_limit: formValue.monthlyLimit,
          max_prompt_length: formValue.maxPromptLength,
          request_timeout: formValue.requestTimeout,
          max_retries: formValue.maxRetries,
          retry_delay: formValue.retryDelay,
        })
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open(
                "OpenAI settings updated successfully",
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
            const fieldErrors = this.extractOpenAIFieldErrors(error);
            let errorMessage = "Failed to update OpenAI settings";

            if (fieldErrors) {
              errorMessage =
                fieldErrors.general ||
                fieldErrors.apiUrl ||
                fieldErrors.apiKey ||
                errorMessage;
            } else {
              errorMessage = this.extractOpenAIErrorMessage(error);
            }

            this.snackBar.open(errorMessage, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            });
          },
        });
    }
  }

  private clearOpenAIFieldErrors(): void {
    this.openaiForm.get("apiUrl")?.setErrors(null);
    this.openaiForm.get("apiKey")?.setErrors(null);
  }

  private extractOpenAIFieldErrors(error: unknown): {
    apiUrl?: string;
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
        "apiUrl" in fieldErrors ||
        "apiKey" in fieldErrors ||
        "general" in fieldErrors;

      if (hasFieldErrors) {
        const err = fieldErrors as Record<string, unknown>;
        return {
          apiUrl: typeof err["apiUrl"] === "string" ? err["apiUrl"] : undefined,
          apiKey: typeof err["apiKey"] === "string" ? err["apiKey"] : undefined,
          general:
            typeof err["general"] === "string" ? err["general"] : undefined,
        };
      }
    }

    return null;
  }

  private extractOpenAIErrorMessage(error: unknown): string {
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
    return "Failed to update OpenAI settings";
  }

  setFormValues(settings: {
    enabled: boolean;
    apiUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    dailyLimit: number;
    monthlyLimit: number;
    maxPromptLength: number;
    requestTimeout: number;
    maxRetries: number;
    retryDelay: number;
  }): void {
    this.openaiForm.patchValue({
      enabled: settings.enabled,
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey || (settings.enabled ? "••••••••" : ""),
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      dailyLimit: settings.dailyLimit,
      monthlyLimit: settings.monthlyLimit,
      maxPromptLength: settings.maxPromptLength,
      requestTimeout: settings.requestTimeout,
      maxRetries: settings.maxRetries,
      retryDelay: settings.retryDelay,
    });
  }
}
