/**
 * AI service for content processing using OpenAI-compatible APIs.
 *
 * Provides translation, summarization, and custom prompt processing
 * with structured JSON output and retry logic.
 */

import axios from "axios";

import { logger } from "../utils/logger";

import { AIRequestRetryHandler } from "./ai-request-handler";
import { AIResponseParser } from "./ai-response-parser";
import type { AIServiceConfig } from "./ai.service.interface";

export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  /**
   * Replace base64 images with placeholders to reduce token usage.
   */
  private replaceBase64ImagesWithPlaceholders(
    content: string,
  ): [string, Map<string, string>] {
    const pattern =
      /(<img[^>]*\ssrc=)(["']?)(data:image\/[^;]+;base64,[^"'>\s]+)(\2)/gi;

    const placeholders = new Map<string, string>();
    let placeholderCounter = 0;

    const contentWithPlaceholders = content.replace(
      pattern,
      (match, prefix, quoteStart, base64Data, quoteEnd) => {
        const placeholder = `[IMAGE_PLACEHOLDER_${placeholderCounter}]`;
        placeholders.set(placeholder, base64Data);
        placeholderCounter++;
        return `${prefix}${quoteStart}${placeholder}${quoteEnd}`;
      },
    );

    if (placeholders.size > 0) {
      logger.debug(
        { count: placeholders.size },
        "Replaced base64 images with placeholders",
      );
    }

    return [contentWithPlaceholders, placeholders];
  }

  /**
   * Restore base64 images from placeholders.
   */
  private restoreBase64ImagesFromPlaceholders(
    content: string,
    placeholders: Map<string, string>,
  ): string {
    if (placeholders.size === 0) return content;

    let restored = content;
    for (const [placeholder, base64Data] of placeholders.entries()) {
      restored = restored.replace(placeholder, base64Data);
    }

    logger.debug(
      { count: placeholders.size },
      "Restored base64 images from placeholders",
    );
    return restored;
  }


  /**
   * Make API request with retry logic.
   */
  private async makeRequest(
    messages: Array<{ role: string; content: string }>,
    responseFormat?: {
      type: string;
      json_schema: {
        name: string;
        strict: boolean;
        schema: Record<string, unknown>;
      };
    },
  ): Promise<Record<string, unknown>> {
    const retryHandler = new AIRequestRetryHandler({
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
    });
    const responseParser = new AIResponseParser();

    const payload = this.buildRequestPayload(messages, responseFormat);
    const headers = this.buildRequestHeaders();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const data = await this.executeRequest(payload, headers);
        return this.handleSuccessResponse(data, responseFormat, responseParser);
      } catch (error) {
        lastError = await this.handleRequestError(
          error,
          attempt,
          retryHandler,
          responseParser,
        );
      }
    }

    throw new Error(
      `AI request failed after ${this.config.maxRetries} retries: ${lastError?.message}`,
    );
  }

  /**
   * Build request payload.
   */
  private buildRequestPayload(
    messages: Array<{ role: string; content: string }>,
    responseFormat?: Record<string, unknown>,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    if (responseFormat) {
      payload["response_format"] = responseFormat;
    }

    return payload;
  }

  /**
   * Build request headers.
   */
  private buildRequestHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Execute API request.
   */
  private async executeRequest(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await axios.post(
      `${this.config.apiUrl}/chat/completions`,
      payload,
      {
        headers,
        timeout: this.config.timeout * 1000,
      },
    );
    return response.data;
  }

  /**
   * Handle successful API response.
   */
  private handleSuccessResponse(
    data: Record<string, unknown>,
    responseFormat: Record<string, unknown> | undefined,
    responseParser: AIResponseParser,
  ): Record<string, unknown> {
    const choices = data.choices as Array<Record<string, unknown>>;
    const message = choices[0].message as Record<string, unknown>;
    const contentStr = String(message.content);
    const finishReason = String(choices[0].finish_reason || "");

    if (responseParser.isTruncated(finishReason)) {
      responseParser.logTruncation(contentStr.length, this.config.maxTokens);
    }

    if (responseFormat) {
      return responseParser.parseJSON(
        contentStr,
        finishReason,
        this.config.maxTokens,
        this.config.maxRetries,
        0,
      );
    }

    return { content: contentStr };
  }

  /**
   * Handle request error with retry logic.
   */
  private async handleRequestError(
    error: unknown,
    attempt: number,
    retryHandler: AIRequestRetryHandler,
    responseParser: AIResponseParser,
  ): Promise<Error> {
    if (responseParser.isJsonParseError(error)) {
      const parsedError = error instanceof Error ? error : new Error(String(error));
      if (retryHandler.shouldRetry(attempt)) {
        await this.waitBeforeRetry(attempt, retryHandler, null);
      }
      return parsedError;
    }

    const retryInfo = retryHandler.extractRetryInfo(error);
    retryHandler.logRetryAttempt(
      attempt,
      retryInfo.isRateLimit,
      retryInfo.error.message,
    );

    if (retryHandler.shouldRetry(attempt)) {
      await this.waitBeforeRetry(attempt, retryHandler, retryInfo.retryAfter);
    }

    return retryInfo.error;
  }

  /**
   * Wait before retrying with appropriate delay.
   */
  private async waitBeforeRetry(
    attempt: number,
    retryHandler: AIRequestRetryHandler,
    retryAfter: number | null,
  ): Promise<void> {
    const delay = retryHandler.calculateRetryDelay(attempt, retryAfter);
    logger.info({ delay }, "Retrying after delay");
    await retryHandler.wait(delay);
  }

  /**
   * Translate HTML content to target language.
   */
  async translate(
    content: string,
    targetLanguage: string,
    _sourceLanguage: string = "auto",
  ): Promise<string> {
    const systemPrompt = `You are a professional translator. Translate the provided HTML content to the target language.

CRITICAL RULES:
1. Preserve ALL HTML tags, attributes, and structure exactly
2. Only translate text content within tags
3. Do NOT translate: URLs, code blocks, technical terms, proper nouns
4. Maintain formatting, line breaks, and spacing
5. Preserve image placeholders (e.g., [IMAGE_PLACEHOLDER_0]) exactly as they appear
6. Return ONLY the translated HTML in the 'translated_html' field`;

    // Replace base64 images with placeholders
    const [contentWithPlaceholders, placeholders] =
      this.replaceBase64ImagesWithPlaceholders(content);

    const userPrompt = `Translate this HTML content to ${targetLanguage}:

${contentWithPlaceholders}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "translation_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            detected_language: {
              type: "string",
              description: "Detected source language code",
            },
            translated_html: {
              type: "string",
              description: "Translated HTML content",
            },
          },
          required: ["detected_language", "translated_html"],
          additionalProperties: false,
        },
      },
    };

    const result = (await this.makeRequest(
      messages,
      responseFormat,
    )) as unknown as {
      detected_language: string;
      translated_html: string;
    };

    // Restore base64 images
    const translatedHtml = this.restoreBase64ImagesFromPlaceholders(
      result.translated_html,
      placeholders,
    );

    logger.info(
      {
        detectedLanguage: result.detected_language,
        targetLanguage,
      },
      "Content translated",
    );

    return translatedHtml;
  }

  /**
   * Generate concise summary of HTML content.
   */
  async summarize(content: string): Promise<string> {
    const systemPrompt = `You are a content summarizer. Create a concise summary of the article.

RULES:
1. Extract 3-5 key points as bullet list
2. Each point should be 1-2 sentences max
3. Focus on main ideas, facts, and conclusions
4. Return HTML formatted list (<ul><li>...</li></ul>)
5. Be objective and factual
6. Keep the summary in the content language (do not translate it yet)
7. Preserve image placeholders (e.g., [IMAGE_PLACEHOLDER_0]) if present in summary`;

    // Replace base64 images with placeholders
    const [contentWithPlaceholders, placeholders] =
      this.replaceBase64ImagesWithPlaceholders(content);

    const userPrompt = `Summarize this article:

${contentWithPlaceholders}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "summary_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary_html: {
              type: "string",
              description: "Summary as HTML bullet list",
            },
          },
          required: ["summary_html"],
          additionalProperties: false,
        },
      },
    };

    const result = (await this.makeRequest(
      messages,
      responseFormat,
    )) as unknown as {
      summary_html: string;
    };

    // Restore base64 images
    const summaryHtml = this.restoreBase64ImagesFromPlaceholders(
      result.summary_html,
      placeholders,
    );

    logger.info("Content summarized");
    return summaryHtml;
  }

  /**
   * Process content with custom prompt.
   */
  async processCustomPrompt(content: string, prompt: string): Promise<string> {
    const systemPrompt = `You are a content processor. Process the provided HTML content according to the user's instructions.

CRITICAL RULES:
1. Preserve ALL HTML tags, attributes, and structure exactly
2. Only modify text content as instructed
3. Do NOT translate unless explicitly asked
4. Maintain formatting, line breaks, and spacing
5. Preserve image placeholders (e.g., [IMAGE_PLACEHOLDER_0]) exactly as they appear
6. Return ONLY the processed HTML in the 'processed_html' field`;

    // Replace base64 images with placeholders
    const [contentWithPlaceholders, placeholders] =
      this.replaceBase64ImagesWithPlaceholders(content);

    const userPrompt = `${prompt}

Content to process:

${contentWithPlaceholders}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "custom_prompt_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            processed_html: {
              type: "string",
              description: "Processed HTML content",
            },
          },
          required: ["processed_html"],
          additionalProperties: false,
        },
      },
    };

    const result = (await this.makeRequest(
      messages,
      responseFormat,
    )) as unknown as {
      processed_html: string;
    };

    // Restore base64 images
    const processedHtml = this.restoreBase64ImagesFromPlaceholders(
      result.processed_html,
      placeholders,
    );

    logger.info("Content processed with custom prompt");
    return processedHtml;
  }
}

/**
 * Create AI service instance from user settings.
 */
export function createAIService(userSettings: {
  openaiApiUrl: string;
  openaiApiKey: string;
  aiModel: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiRequestTimeout: number;
  aiMaxRetries: number;
  aiRetryDelay: number;
}): AIService {
  if (!userSettings.openaiApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  return new AIService({
    apiUrl: userSettings.openaiApiUrl.replace(/\/$/, ""),
    apiKey: userSettings.openaiApiKey,
    model: userSettings.aiModel,
    temperature: userSettings.aiTemperature,
    maxTokens: userSettings.aiMaxTokens,
    timeout: userSettings.aiRequestTimeout,
    maxRetries: userSettings.aiMaxRetries,
    retryDelay: userSettings.aiRetryDelay,
  });
}
