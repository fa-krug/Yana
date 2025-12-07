import { Injectable, inject } from "@angular/core";
import { Observable, from } from "rxjs";
import { map } from "rxjs";
import { TRPCService } from "../trpc/trpc.service";

export interface UserProfile {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface UserSettings {
  reddit_enabled: boolean;
  youtube_enabled: boolean;
  openai_enabled: boolean;
}

export interface RedditSettings {
  enabled: boolean;
  client_id: string;
  client_secret: string; // Empty if set (masked)
  user_agent: string;
}

export interface YouTubeSettings {
  enabled: boolean;
  api_key: string; // Empty if set (masked)
}

export interface OpenAISettings {
  enabled: boolean;
  api_url: string;
  api_key: string; // Empty if set (masked)
  model: string;
  temperature: number;
  max_tokens: number;
  daily_limit: number;
  monthly_limit: number;
  max_prompt_length: number;
  request_timeout: number;
  max_retries: number;
  retry_delay: number;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface RedditSettingsRequest {
  enabled: boolean;
  client_id: string;
  client_secret: string;
  user_agent: string;
}

export interface YouTubeSettingsRequest {
  enabled: boolean;
  api_key: string;
}

export interface OpenAISettingsRequest {
  enabled: boolean;
  api_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  daily_limit: number;
  monthly_limit: number;
  max_prompt_length: number;
  request_timeout: number;
  max_retries: number;
  retry_delay: number;
}

export interface MessageResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: "root",
})
export class UserSettingsService {
  private trpc = inject(TRPCService);

  getProfile(): Observable<UserProfile> {
    return from(this.trpc.client.user.getProfile.query()).pipe(
      map((profile) => ({
        username: profile.username,
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        email: profile.email,
      })),
    );
  }

  updateProfile(data: UpdateProfileRequest): Observable<MessageResponse> {
    return from(this.trpc.client.user.updateProfile.mutate(data));
  }

  getSettings(): Observable<UserSettings> {
    return from(this.trpc.client.user.getSettings.query()).pipe(
      map((settings) => ({
        reddit_enabled: settings.redditEnabled || false,
        youtube_enabled: settings.youtubeEnabled || false,
        openai_enabled: settings.openaiEnabled || false,
      })),
    );
  }

  updateSettings(data: Partial<UserSettings>): Observable<UserSettings> {
    return from(
      this.trpc.client.user.updateSettings.mutate({
        redditEnabled: data.reddit_enabled,
        youtubeEnabled: data.youtube_enabled,
        openaiEnabled: data.openai_enabled,
      } as any),
    ).pipe(
      map((settings) => ({
        reddit_enabled: settings.redditEnabled || false,
        youtube_enabled: settings.youtubeEnabled || false,
        openai_enabled: settings.openaiEnabled || false,
      })),
    );
  }

  getRedditSettings(): Observable<RedditSettings> {
    return from(this.trpc.client.user.getRedditSettings.query()).pipe(
      map((settings) => ({
        enabled: settings.enabled,
        client_id: settings.clientId || "",
        client_secret: settings.clientSecret || "",
        user_agent: settings.userAgent || "",
      })),
    );
  }

  updateRedditSettings(
    data: RedditSettingsRequest,
  ): Observable<MessageResponse> {
    return from(
      this.trpc.client.user.updateRedditSettings.mutate({
        redditEnabled: data.enabled,
        redditClientId: data.client_id,
        redditClientSecret: data.client_secret,
        redditUserAgent: data.user_agent,
      }),
    );
  }

  getYouTubeSettings(): Observable<YouTubeSettings> {
    return from(this.trpc.client.user.getYouTubeSettings.query()).pipe(
      map((settings) => ({
        enabled: settings.enabled,
        api_key: settings.apiKey || "",
      })),
    );
  }

  updateYouTubeSettings(
    data: YouTubeSettingsRequest,
  ): Observable<MessageResponse> {
    return from(
      this.trpc.client.user.updateYouTubeSettings.mutate({
        youtubeEnabled: data.enabled,
        youtubeApiKey: data.api_key,
      }),
    );
  }

  getOpenAISettings(): Observable<OpenAISettings> {
    return from(this.trpc.client.user.getOpenAISettings.query()).pipe(
      map((settings) => ({
        enabled: settings.enabled,
        api_url: settings.apiUrl || "",
        api_key: settings.apiKey || "",
        model: settings.model || "",
        temperature: settings.temperature || 0.7,
        max_tokens: settings.maxTokens || 1000,
        daily_limit: settings.defaultDailyLimit || 100,
        monthly_limit: settings.defaultMonthlyLimit || 3000,
        max_prompt_length: settings.maxPromptLength || 2000,
        request_timeout: settings.requestTimeout || 30000,
        max_retries: settings.maxRetries || 3,
        retry_delay: settings.retryDelay || 1000,
      })),
    );
  }

  updateOpenAISettings(
    data: OpenAISettingsRequest,
  ): Observable<MessageResponse> {
    return from(
      this.trpc.client.user.updateOpenAISettings.mutate({
        openaiEnabled: data.enabled,
        openaiApiUrl: data.api_url,
        openaiApiKey: data.api_key,
        aiModel: data.model,
        aiTemperature: data.temperature,
        aiMaxTokens: data.max_tokens,
        aiDefaultDailyLimit: data.daily_limit,
        aiDefaultMonthlyLimit: data.monthly_limit,
        aiMaxPromptLength: data.max_prompt_length,
        aiRequestTimeout: data.request_timeout,
        aiMaxRetries: data.max_retries,
        aiRetryDelay: data.retry_delay,
      }),
    );
  }

  changePassword(data: ChangePasswordRequest): Observable<MessageResponse> {
    return from(
      this.trpc.client.user.changePassword.mutate({
        current_password: data.current_password,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      }),
    );
  }
}
