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
