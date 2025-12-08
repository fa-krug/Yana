import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatIconModule } from "@angular/material/icon";
import { UserSettingsService } from "../../core/services/user-settings.service";
import { ChangePasswordDialogComponent } from "./change-password-dialog.component";

@Component({
  selector: "app-settings",
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
    MatIconModule,
  ],
  templateUrl: "./settings.component.html",
  styleUrls: ["./settings.component.scss"],
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingsService = inject(UserSettingsService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  profileForm: FormGroup;
  redditForm: FormGroup;
  youtubeForm: FormGroup;
  openaiForm: FormGroup;

  loading = signal(false);

  constructor() {
    this.profileForm = this.fb.group({
      firstName: ["", Validators.required],
      lastName: ["", Validators.required],
      email: ["", [Validators.required, Validators.email]],
    });

    this.redditForm = this.fb.group({
      enabled: [false],
      clientId: [""],
      clientSecret: [""],
      userAgent: ["Yana/1.0"],
    });

    this.youtubeForm = this.fb.group({
      enabled: [false],
      apiKey: [""],
    });

    this.openaiForm = this.fb.group({
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
  }

  ngOnInit(): void {
    this.loadProfile();
    this.loadSettings();
  }

  loadProfile(): void {
    this.loading.set(true);
    this.settingsService.getProfile().subscribe({
      next: (profile) => {
        this.profileForm.patchValue({
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
        });
        this.loading.set(false);
      },
      error: (error) => {
        this.snackBar.open("Failed to load profile", "Close", {
          duration: 3000,
        });
        this.loading.set(false);
      },
    });
  }

  loadSettings(): void {
    // Load basic enabled flags
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        this.redditForm.patchValue({ enabled: settings.reddit_enabled });
        this.youtubeForm.patchValue({ enabled: settings.youtube_enabled });
        this.openaiForm.patchValue({ enabled: settings.openai_enabled });
      },
      error: (error) => {
        this.snackBar.open("Failed to load settings", "Close", {
          duration: 3000,
        });
      },
    });

    // Load full Reddit settings
    this.settingsService.getRedditSettings().subscribe({
      next: (settings) => {
        this.redditForm.patchValue({
          enabled: settings.enabled,
          clientId: settings.client_id,
          clientSecret:
            settings.client_secret || (settings.enabled ? "••••••••" : ""),
          userAgent: settings.user_agent,
        });
      },
      error: () => {
        // Silently fail - settings might not exist yet
      },
    });

    // Load full YouTube settings
    this.settingsService.getYouTubeSettings().subscribe({
      next: (settings) => {
        this.youtubeForm.patchValue({
          enabled: settings.enabled,
          apiKey: settings.api_key || (settings.enabled ? "••••••••" : ""),
        });
      },
      error: () => {
        // Silently fail - settings might not exist yet
      },
    });

    // Load full OpenAI settings
    this.settingsService.getOpenAISettings().subscribe({
      next: (settings) => {
        this.openaiForm.patchValue({
          enabled: settings.enabled,
          apiUrl: settings.api_url,
          apiKey: settings.api_key || (settings.enabled ? "••••••••" : ""),
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.max_tokens,
          dailyLimit: settings.daily_limit,
          monthlyLimit: settings.monthly_limit,
          maxPromptLength: settings.max_prompt_length,
          requestTimeout: settings.request_timeout,
          maxRetries: settings.max_retries,
          retryDelay: settings.retry_delay,
        });
      },
      error: () => {
        // Silently fail - settings might not exist yet
      },
    });
  }

  updateProfile(): void {
    if (this.profileForm.valid) {
      this.loading.set(true);
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
            this.loading.set(false);
          },
          error: (error) => {
            this.snackBar.open(
              error.error?.message || "Failed to update profile",
              "Close",
              {
                duration: 3000,
              },
            );
            this.loading.set(false);
          },
        });
    }
  }

  openChangePasswordDialog(): void {
    this.dialog.open(ChangePasswordDialogComponent, {
      width: "500px",
    });
  }

  updateRedditSettings(): void {
    if (this.redditForm.valid) {
      this.loading.set(true);
      // Clear previous errors
      this.clearRedditFieldErrors();

      const formValue = this.redditForm.value;
      // Don't send placeholder values for secrets (keep existing value)
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
            } else {
              this.snackBar.open(response.message, "Close", { duration: 5000 });
            }
            this.loading.set(false);
          },
          error: (error) => {
            // Extract error message and show in red snackbar
            const fieldErrors = this.extractRedditFieldErrors(error);
            let errorMessage = "Failed to update Reddit settings";

            if (fieldErrors) {
              // Get the most specific error message
              errorMessage =
                fieldErrors.general ||
                fieldErrors.clientId ||
                fieldErrors.clientSecret ||
                fieldErrors.userAgent ||
                errorMessage;
            } else {
              errorMessage = this.extractRedditErrorMessage(error);
            }

            // Show red error snackbar
            this.snackBar.open(errorMessage, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            });
            this.loading.set(false);
          },
        });
    }
  }

  private clearRedditFieldErrors(): void {
    this.redditForm.get("clientId")?.setErrors(null);
    this.redditForm.get("clientSecret")?.setErrors(null);
    this.redditForm.get("userAgent")?.setErrors(null);
  }

  private extractRedditFieldErrors(error: any): {
    clientId?: string;
    clientSecret?: string;
    userAgent?: string;
    general?: string;
  } | null {
    // tRPC client errors: field errors should be in error.data.fieldErrors
    // Check all possible locations
    let fieldErrors = error?.data?.fieldErrors;

    // If not found, check shape.data.fieldErrors
    if (!fieldErrors) {
      fieldErrors = error?.shape?.data?.fieldErrors;
    }

    // If still not found, try to get from the cause (might be serialized differently)
    if (!fieldErrors && error?.data?.cause) {
      const cause = error.data.cause;
      // Check if cause has our field error properties
      if (
        typeof cause === "object" &&
        ("clientId" in cause || "clientSecret" in cause || "general" in cause)
      ) {
        fieldErrors = cause;
      }
    }

    if (fieldErrors && typeof fieldErrors === "object") {
      // Return the field errors object
      return {
        clientId: fieldErrors.clientId,
        clientSecret: fieldErrors.clientSecret,
        userAgent: fieldErrors.userAgent,
        general: fieldErrors.general,
      };
    }

    return null;
  }

  private setRedditFieldErrors(errors: {
    clientId?: string;
    clientSecret?: string;
    userAgent?: string;
    general?: string;
  }): void {
    if (errors.clientId) {
      const control = this.redditForm.get("clientId");
      if (control) {
        control.setErrors({ server: errors.clientId });
        control.markAsTouched();
        control.markAsDirty();
      }
    }
    if (errors.clientSecret) {
      const control = this.redditForm.get("clientSecret");
      if (control) {
        control.setErrors({ server: errors.clientSecret });
        control.markAsTouched();
        control.markAsDirty();
      }
    }
    if (errors.userAgent) {
      const control = this.redditForm.get("userAgent");
      if (control) {
        control.setErrors({ server: errors.userAgent });
        control.markAsTouched();
        control.markAsDirty();
      }
    }
    // If general error exists but no specific field errors, show it in snackbar
    if (
      errors.general &&
      !errors.clientId &&
      !errors.clientSecret &&
      !errors.userAgent
    ) {
      this.snackBar.open(errors.general, "Close", { duration: 5000 });
    }
    // Force form to update
    this.redditForm.updateValueAndValidity();
  }

  private extractRedditErrorMessage(error: any): string {
    // Try to extract error message from various error response formats
    if (error?.data?.message) {
      return error.data.message;
    }
    if (error?.error?.message) {
      return error.error.message;
    }
    if (error?.message) {
      return error.message;
    }
    return "Failed to update Reddit settings";
  }

  updateYouTubeSettings(): void {
    if (this.youtubeForm.valid) {
      this.loading.set(true);
      // Clear previous errors
      this.clearYouTubeFieldErrors();

      const formValue = this.youtubeForm.value;
      // Don't send placeholder values for secrets (keep existing value)
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
            } else {
              this.snackBar.open(response.message, "Close", { duration: 5000 });
            }
            this.loading.set(false);
          },
          error: (error) => {
            // Extract error message and show in red snackbar
            const fieldErrors = this.extractYouTubeFieldErrors(error);
            let errorMessage = "Failed to update YouTube settings";

            if (fieldErrors) {
              errorMessage =
                fieldErrors.general || fieldErrors.apiKey || errorMessage;
            } else {
              errorMessage = this.extractYouTubeErrorMessage(error);
            }

            // Show red error snackbar
            this.snackBar.open(errorMessage, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            });
            this.loading.set(false);
          },
        });
    }
  }

  private clearYouTubeFieldErrors(): void {
    this.youtubeForm.get("apiKey")?.setErrors(null);
  }

  private extractYouTubeFieldErrors(error: any): {
    apiKey?: string;
    general?: string;
  } | null {
    // tRPC client errors: field errors are in error.data.fieldErrors (from errorFormatter)
    const fieldErrors =
      error?.data?.fieldErrors ||
      error?.shape?.data?.fieldErrors ||
      error?.data?.cause ||
      error?.shape?.data?.cause;

    if (fieldErrors && typeof fieldErrors === "object") {
      const hasFieldErrors =
        "apiKey" in fieldErrors || "general" in fieldErrors;

      if (hasFieldErrors) {
        return {
          apiKey: fieldErrors.apiKey,
          general: fieldErrors.general,
        };
      }
    }

    return null;
  }

  private setYouTubeFieldErrors(errors: {
    apiKey?: string;
    general?: string;
  }): void {
    if (errors.apiKey) {
      const control = this.youtubeForm.get("apiKey");
      control?.setErrors({ server: errors.apiKey });
      control?.markAsTouched();
    }
  }

  private extractYouTubeErrorMessage(error: any): string {
    // Try to extract error message from various error response formats
    if (error?.data?.message) {
      return error.data.message;
    }
    if (error?.error?.message) {
      return error.error.message;
    }
    if (error?.message) {
      return error.message;
    }
    return "Failed to update YouTube settings";
  }

  updateOpenAISettings(): void {
    if (this.openaiForm.valid) {
      this.loading.set(true);
      // Clear previous errors
      this.clearOpenAIFieldErrors();

      const formValue = this.openaiForm.value;
      // Don't send placeholder values for secrets (keep existing value)
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
            } else {
              this.snackBar.open(response.message, "Close", { duration: 5000 });
            }
            this.loading.set(false);
          },
          error: (error) => {
            // Extract error message and show in red snackbar
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

            // Show red error snackbar
            this.snackBar.open(errorMessage, "Close", {
              duration: 5000,
              panelClass: ["error-snackbar"],
            });
            this.loading.set(false);
          },
        });
    }
  }

  private clearOpenAIFieldErrors(): void {
    this.openaiForm.get("apiUrl")?.setErrors(null);
    this.openaiForm.get("apiKey")?.setErrors(null);
  }

  private extractOpenAIFieldErrors(error: any): {
    apiUrl?: string;
    apiKey?: string;
    general?: string;
  } | null {
    // tRPC client errors: field errors are in error.data.fieldErrors (from errorFormatter)
    const fieldErrors =
      error?.data?.fieldErrors ||
      error?.shape?.data?.fieldErrors ||
      error?.data?.cause ||
      error?.shape?.data?.cause;

    if (fieldErrors && typeof fieldErrors === "object") {
      const hasFieldErrors =
        "apiUrl" in fieldErrors ||
        "apiKey" in fieldErrors ||
        "general" in fieldErrors;

      if (hasFieldErrors) {
        return {
          apiUrl: fieldErrors.apiUrl,
          apiKey: fieldErrors.apiKey,
          general: fieldErrors.general,
        };
      }
    }

    return null;
  }

  private setOpenAIFieldErrors(errors: {
    apiUrl?: string;
    apiKey?: string;
    general?: string;
  }): void {
    if (errors.apiUrl) {
      const control = this.openaiForm.get("apiUrl");
      control?.setErrors({ server: errors.apiUrl });
      control?.markAsTouched();
    }
    if (errors.apiKey) {
      const control = this.openaiForm.get("apiKey");
      control?.setErrors({ server: errors.apiKey });
      control?.markAsTouched();
    }
  }

  private extractOpenAIErrorMessage(error: any): string {
    // Try to extract error message from various error response formats
    if (error?.data?.message) {
      return error.data.message;
    }
    if (error?.error?.message) {
      return error.error.message;
    }
    if (error?.message) {
      return error.message;
    }
    return "Failed to update OpenAI settings";
  }
}
