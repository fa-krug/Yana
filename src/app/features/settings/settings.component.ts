import {
  Component,
  OnInit,
  AfterViewInit,
  inject,
  signal,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatIconModule } from "@angular/material/icon";
import { UserSettingsService } from "../../core/services/user-settings.service";
import { ProfileSettingsComponent } from "./components/profile-settings.component";
import { RedditSettingsComponent } from "./components/reddit-settings.component";
import { YouTubeSettingsComponent } from "./components/youtube-settings.component";
import { OpenAISettingsComponent } from "./components/openai-settings.component";

@Component({
  selector: "app-settings",
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatIconModule,
    ProfileSettingsComponent,
    RedditSettingsComponent,
    YouTubeSettingsComponent,
    OpenAISettingsComponent,
  ],
  templateUrl: "./settings.component.html",
  styleUrls: ["./settings.component.scss"],
})
export class SettingsComponent implements OnInit, AfterViewInit {
  private readonly settingsService = inject(UserSettingsService);
  private readonly snackBar = inject(MatSnackBar);

  @ViewChild(ProfileSettingsComponent)
  protected profileSettings!: ProfileSettingsComponent;
  @ViewChild(RedditSettingsComponent)
  protected redditSettings!: RedditSettingsComponent;
  @ViewChild(YouTubeSettingsComponent)
  protected youtubeSettings!: YouTubeSettingsComponent;
  @ViewChild(OpenAISettingsComponent)
  protected openaiSettings!: OpenAISettingsComponent;

  protected readonly loading = signal(false);

  ngOnInit(): void {
    // Component initialization - data loading happens in ngAfterViewInit
  }

  ngAfterViewInit(): void {
    // Use setTimeout to ensure ViewChild references are fully available
    setTimeout(() => {
      this.loadProfile();
      this.loadSettings();
    }, 0);
  }

  protected loadProfile(): void {
    this.loading.set(true);
    this.settingsService.getProfile().subscribe({
      next: (profile) => {
        // Use setTimeout to ensure ViewChild is available after loading state changes
        setTimeout(() => {
          if (this.profileSettings) {
            this.profileSettings.setFormValues({
              firstName: profile.firstName,
              lastName: profile.lastName,
              email: profile.email,
            });
          }
        }, 0);
        this.loading.set(false);
      },
      error: () => {
        this.snackBar.open("Failed to load profile", "Close", {
          duration: 3000,
        });
        this.loading.set(false);
      },
    });
  }

  protected loadSettings(): void {
    // Load basic enabled flags
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        // Enabled flags will be set when full settings load
      },
      error: () => {
        this.snackBar.open("Failed to load settings", "Close", {
          duration: 3000,
        });
      },
    });

    // Load full Reddit settings
    this.settingsService.getRedditSettings().subscribe({
      next: (settings) => {
        setTimeout(() => {
          if (this.redditSettings) {
            this.redditSettings.setFormValues({
              enabled: settings.enabled,
              clientId: settings.client_id || "",
              clientSecret: settings.client_secret || "",
              userAgent: settings.user_agent || "",
            });
          }
        }, 0);
      },
      error: () => {
        // Silently fail - settings might not exist yet
      },
    });

    // Load full YouTube settings
    this.settingsService.getYouTubeSettings().subscribe({
      next: (settings) => {
        setTimeout(() => {
          if (this.youtubeSettings) {
            this.youtubeSettings.setFormValues({
              enabled: settings.enabled,
              apiKey: settings.api_key || "",
            });
          }
        }, 0);
      },
      error: () => {
        // Silently fail - settings might not exist yet
      },
    });

    // Load full OpenAI settings
    this.settingsService.getOpenAISettings().subscribe({
      next: (settings) => {
        setTimeout(() => {
          if (this.openaiSettings) {
            this.openaiSettings.setFormValues({
              enabled: settings.enabled,
              apiUrl: settings.api_url || "",
              apiKey: settings.api_key || "",
              model: settings.model || "",
              temperature: settings.temperature || 0.3,
              maxTokens: settings.max_tokens || 2000,
              dailyLimit: settings.daily_limit || 200,
              monthlyLimit: settings.monthly_limit || 2000,
              maxPromptLength: settings.max_prompt_length || 500,
              requestTimeout: settings.request_timeout || 120,
              maxRetries: settings.max_retries || 3,
              retryDelay: settings.retry_delay || 2,
            });
          }
        }, 0);
      },
      error: () => {
        // Silently fail - settings might not exist yet
      },
    });
  }
}
