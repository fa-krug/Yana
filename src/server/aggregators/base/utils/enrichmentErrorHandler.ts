/**
 * Error handling abstraction for article enrichment pipeline.
 * Centralizes error categorization, logging, and recovery strategies.
 */

import type pino from "pino";

import { ArticleSkipError } from "../exceptions";
import type { RawArticle } from "../types";

/**
 * Represents the action to take after handling an error.
 */
export enum ErrorRecoveryAction {
  /** Skip the current article entirely */
  SKIP = "skip",
  /** Use fallback content and continue */
  FALLBACK = "fallback",
  /** Continue processing without content */
  CONTINUE = "continue",
  /** Rethrow the error */
  RETHROW = "rethrow",
}

/**
 * Context information for error handling.
 */
export interface ErrorContext {
  step: string;
  aggregator: string;
  feedId?: number;
  url: string;
  article: RawArticle;
}

/**
 * Handles errors during article enrichment with unified logging and recovery strategies.
 */
export class EnrichmentErrorHandler {
  constructor(private logger: pino.Logger) {}

  /**
   * Handle an error during enrichment with appropriate logging and recovery action.
   */
  handleError(
    error: unknown,
    context: ErrorContext,
    operation: string,
  ): ErrorRecoveryAction {
    // ArticleSkipError (4xx HTTP errors) - skip article entirely
    if (error instanceof ArticleSkipError) {
      this.logger.warn(
        {
          step: context.step,
          aggregator: context.aggregator,
          feedId: context.feedId,
          url: context.url,
          statusCode: error.statusCode,
          skipped: true,
        },
        `4xx error during ${operation}, skipping article`,
      );
      return ErrorRecoveryAction.SKIP;
    }

    // Convert error to proper Error instance
    const errorInstance =
      error instanceof Error ? error : new Error(String(error));

    this.logger.warn(
      {
        step: context.step,
        aggregator: context.aggregator,
        feedId: context.feedId,
        url: context.url,
        error: errorInstance,
      },
      `Error during ${operation}, using fallback`,
    );

    return ErrorRecoveryAction.FALLBACK;
  }

  /**
   * Handle error during optional operation (e.g., image extraction) that shouldn't skip article.
   */
  handleOptionalError(
    error: unknown,
    context: ErrorContext,
    operation: string,
  ): void {
    // ArticleSkipError (4xx HTTP errors) - skip article entirely
    if (error instanceof ArticleSkipError) {
      this.logger.warn(
        {
          step: context.step,
          aggregator: context.aggregator,
          feedId: context.feedId,
          url: context.url,
          statusCode: error.statusCode,
          skipped: true,
        },
        `4xx error during ${operation}, skipping article`,
      );
      return;
    }

    // Non-critical errors for optional operations are just logged
    const errorInstance =
      error instanceof Error ? error : new Error(String(error));

    this.logger.debug(
      {
        step: context.step,
        aggregator: context.aggregator,
        feedId: context.feedId,
        url: context.url,
        error: errorInstance,
      },
      `${operation} failed (non-critical)`,
    );
  }

  /**
   * Handle error that occurred at top level of article processing.
   */
  handleTopLevelError(
    error: unknown,
    context: ErrorContext,
    progress: string,
  ): ErrorRecoveryAction {
    // ArticleSkipError (4xx HTTP errors) - skip article entirely
    if (error instanceof ArticleSkipError) {
      this.logger.warn(
        {
          step: context.step,
          aggregator: context.aggregator,
          feedId: context.feedId,
          progress,
          url: context.url,
          statusCode: error.statusCode,
          skipped: true,
        },
        "4xx error processing article, skipping",
      );
      return ErrorRecoveryAction.SKIP;
    }

    // Unexpected errors at top level
    const errorInstance =
      error instanceof Error ? error : new Error(String(error));

    this.logger.error(
      {
        step: context.step,
        aggregator: context.aggregator,
        feedId: context.feedId,
        progress,
        url: context.url,
        error: errorInstance,
      },
      "Error processing article",
    );

    // Continue with next article
    return ErrorRecoveryAction.CONTINUE;
  }

  /**
   * Check if error is an ArticleSkipError (should skip article).
   */
  isSkipError(error: unknown): error is ArticleSkipError {
    return error instanceof ArticleSkipError;
  }
}
