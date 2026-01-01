/**
 * AI service interface and types.
 */

export class AIServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIServiceError";
  }
}

export class AIQuotaExceededError extends AIServiceError {
  constructor(message: string = "AI quota exceeded") {
    super(message);
    this.name = "AIQuotaExceededError";
  }
}

export interface AIServiceConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface TranslationResult {
  detectedLanguage: string;
  translatedHtml: string;
}

export interface SummaryResult {
  summaryHtml: string;
}

export interface CustomPromptResult {
  processedHtml: string;
}
