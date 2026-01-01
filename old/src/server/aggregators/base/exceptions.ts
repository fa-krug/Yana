/**
 * Aggregator-specific exceptions.
 */

import { AggregationError } from "@server/errors";

export class ContentFetchError extends AggregationError {
  constructor(
    message: string,
    feedId?: number,
    public originalError?: Error,
  ) {
    super(message, feedId);
    this.name = "ContentFetchError";
  }
}

export class ParseError extends AggregationError {
  constructor(message: string, feedId?: number) {
    super(message, feedId);
    this.name = "ParseError";
  }
}

export class ValidationError extends AggregationError {
  constructor(
    message: string,
    feedId?: number,
    public errors?: unknown[],
  ) {
    super(message, feedId);
    this.name = "ValidationError";
  }
}

/**
 * Exception thrown when a 4xx HTTP error occurs during article processing.
 * This indicates a client error (e.g., 404 Not Found, 403 Forbidden) that
 * should cause the article to be skipped rather than retried.
 */
export class ArticleSkipError extends AggregationError {
  override statusCode: number;

  constructor(
    message: string,
    feedId?: number,
    statusCode: number = 400,
    public originalError?: Error,
  ) {
    super(message, feedId);
    this.statusCode = statusCode;
    this.name = "ArticleSkipError";
  }
}
