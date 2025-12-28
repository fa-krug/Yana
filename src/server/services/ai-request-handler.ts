/**
 * AI request retry handler.
 * Manages retry logic with exponential backoff and rate limit handling.
 */

import axios, { AxiosError } from "axios";

import { logger } from "../utils/logger";

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
}

export interface RetryError {
  isRateLimit: boolean;
  retryAfter: number | null;
  error: Error;
}

/**
 * Manages retry logic for AI API requests.
 * Handles exponential backoff, rate limiting, and error tracking.
 */
export class AIRequestRetryHandler {
  constructor(private config: RetryConfig) {}

  /**
   * Calculate delay for retry attempt.
   * Returns rate limit delay if available, otherwise exponential backoff.
   */
  calculateRetryDelay(attempt: number, retryAfter: number | null): number {
    if (retryAfter !== null) {
      logger.info(
        { delay: retryAfter },
        "Rate limit hit, waiting for Retry-After",
      );
      return retryAfter;
    }
    return this.config.retryDelay * Math.pow(2, attempt);
  }

  /**
   * Extract retry information from axios error.
   * Checks for rate limit status and Retry-After header.
   */
  extractRetryInfo(error: unknown): RetryError {
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

    return {
      isRateLimit,
      retryAfter,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  /**
   * Check if error is retryable and we haven't exhausted retries.
   */
  shouldRetry(attempt: number): boolean {
    return attempt < this.config.maxRetries - 1;
  }

  /**
   * Log retry attempt with context.
   */
  logRetryAttempt(
    attempt: number,
    isRateLimit: boolean,
    errorMessage: string,
  ): void {
    logger.warn(
      {
        attempt: attempt + 1,
        maxRetries: this.config.maxRetries,
        error: errorMessage,
        isRateLimit,
      },
      "AI request failed",
    );
  }

  /**
   * Wait for specified delay before retry.
   */
  async wait(delaySeconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
  }
}
