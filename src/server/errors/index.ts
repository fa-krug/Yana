/**
 * Custom error classes for the server.
 *
 * Provides typed error classes with status codes for better error handling.
 */

export class ServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "ServiceError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class PermissionDeniedError extends ServiceError {
  constructor(message: string = "Permission denied") {
    super(message, 403);
    this.name = "PermissionDeniedError";
  }
}

export class ValidationError extends ServiceError {
  constructor(
    message: string,
    public errors?: unknown[],
  ) {
    super(message, 400);
    this.name = "ValidationError";
  }
}

export class AggregationError extends ServiceError {
  constructor(
    message: string,
    public feedId?: number,
  ) {
    super(message, 500);
    this.name = "AggregationError";
  }
}

export class DatabaseError extends ServiceError {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(message, 500);
    this.name = "DatabaseError";
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message: string = "Authentication required") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string = "Resource conflict") {
    super(message, 409);
    this.name = "ConflictError";
  }
}
