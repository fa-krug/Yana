/**
 * AI service for content processing using OpenAI-compatible APIs.
 *
 * Provides translation, summarization, and custom prompt processing
 * with structured JSON output and retry logic.
 */

import axios, { AxiosError } from "axios";

import { logger } from "../utils/logger";

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
   * Repair JSON by fixing common issues from truncated responses.
   */
  private repairJson(content: string): string {
    if (!content || !content.trim()) return content;

    let repaired = content.trim();

    // If content starts with { but doesn't end with }, try to close it
    if (repaired.startsWith("{") && !repaired.endsWith("}")) {
      const openBraces = (repaired.match(/{/g) || []).length;
      const closeBraces = (repaired.match(/}/g) || []).length;

      if (openBraces > closeBraces) {
        // Try to find where a string value might be truncated
        const lastColon = repaired.lastIndexOf(":");
        if (lastColon > 0) {
          const afterColon = repaired.substring(lastColon + 1).trim();
          if (afterColon.startsWith('"') && !afterColon.endsWith('"')) {
            // String is unclosed - try to find a reasonable place to close it
            const htmlClosingPatterns = [
              /<\/div>/gi,
              /<\/p>/gi,
              /<\/ul>/gi,
              /<\/li>/gi,
              /<\/h[1-6]>/gi,
              /<\/article>/gi,
              /<\/section>/gi,
            ];

            let lastValidPos = -1;
            for (const pattern of htmlClosingPatterns) {
              const matches = [...repaired.matchAll(pattern)];
              if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                if (
                  lastMatch.index != undefined &&
                  lastMatch.index + lastMatch[0].length > lastValidPos
                ) {
                  lastValidPos = lastMatch.index + lastMatch[0].length;
                }
              }
            }

            if (lastValidPos > 0) {
              repaired = repaired.substring(0, lastValidPos) + '"';
            } else {
              // Fallback: just close the string
              const lastQuote = repaired.lastIndexOf('"');
              if (lastQuote > lastColon) {
                const breakChars = [">", " ", "\n"];
                for (const breakChar of breakChars) {
                  const breakPos = repaired.lastIndexOf(breakChar, lastQuote);
                  if (breakPos > lastQuote) {
                    repaired =
                      repaired.substring(0, breakPos + 1) +
                      '"' +
                      repaired.substring(breakPos + 1);
                    break;
                  }
                }
                if (!repaired.endsWith('"')) {
                  repaired += '"';
                }
              }
            }
          }
        }

        // Add missing closing braces
        for (let i = 0; i < openBraces - closeBraces; i++) {
          repaired += "}";
        }
      }
    }

    return repaired;
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
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };

    const payload: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    if (responseFormat) {
      payload["response_format"] = responseFormat;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.config.apiUrl}/chat/completions`,
          payload,
          {
            headers,
            timeout: this.config.timeout * 1000, // Convert to milliseconds
          },
        );

        const data = response.data;
        const content = data.choices[0].message.content;
        const finishReason = data.choices[0].finish_reason || "";

        if (finishReason === "length") {
          logger.warn(
            {
              contentLength: content.length,
              maxTokens: this.config.maxTokens,
            },
            "AI response was truncated",
          );
        }

        // Parse JSON response if structured output
        if (responseFormat) {
          try {
            return JSON.parse(content) as Record<string, unknown>;
          } catch (jsonError) {
            const contentPreview =
              content.length > 500 ? content.substring(0, 500) : content;
            logger.warn(
              {
                attempt: attempt + 1,
                maxRetries: this.config.maxRetries,
                contentLength: content.length,
                finishReason,
                contentPreview,
              },
              "JSON parse error",
            );

            // Try to repair JSON
            const repairedContent = this.repairJson(content);
            if (repairedContent != content) {
              try {
                logger.info("Attempting to parse repaired JSON");
                return JSON.parse(repairedContent) as Record<string, unknown>;
              } catch (repairError) {
                logger.warn(
                  { error: repairError },
                  "Repaired JSON still invalid",
                );
              }
            }

            lastError = jsonError as Error;

            // Retry on JSON parsing errors
            if (attempt < this.config.maxRetries - 1) {
              const delay = this.config.retryDelay * Math.pow(2, attempt);
              logger.info({ delay }, "Retrying after delay");
              await new Promise((resolve) => setTimeout(resolve, delay * 1000));
              continue;
            }

            // Final attempt failed
            if (finishReason === "length") {
              throw new Error(
                `Failed to parse JSON response after ${this.config.maxRetries} attempts. ` +
                  `Response was truncated. Consider increasing max_tokens (current: ${this.config.maxTokens}). ` +
                  `Content preview: ${contentPreview.substring(0, 300)}...`,
              );
            } else {
              throw new Error(
                `Failed to parse JSON response after ${this.config.maxRetries} attempts. ` +
                  `Content length: ${content.length} chars, finish_reason: ${finishReason}`,
              );
            }
          }
        }

        return { content };
      } catch (error) {
        lastError = error as Error;

        // Check for rate limit error
        let isRateLimit = false;
        let retryAfter: number | null = null;

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          if (axiosError.response?.status === 429) {
            isRateLimit = true;
            const retryAfterHeader = axiosError.response.headers["retry-after"];
            if (retryAfterHeader) {
              retryAfter = parseInt(retryAfterHeader, 10);
            }
          }
        }

        logger.warn(
          {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            error: error instanceof Error ? error.message : String(error),
            isRateLimit,
          },
          "AI request failed",
        );

        if (attempt < this.config.maxRetries - 1) {
          let delay: number;
          if (isRateLimit && retryAfter) {
            delay = retryAfter;
            logger.info({ delay }, "Rate limit hit, waiting for Retry-After");
          } else {
            delay = this.config.retryDelay * Math.pow(2, attempt);
          }
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));
          continue;
        }
        break;
      }
    }

    throw new Error(
      `AI request failed after ${this.config.maxRetries} retries: ${lastError?.message}`,
    );
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
