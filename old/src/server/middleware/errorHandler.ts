/**
 * Error handling middleware for Express.
 *
 * Centralized error handling with user-friendly messages
 * and detailed logging in development mode.
 */

import type { Request, Response, NextFunction } from "express";

import {
  ServiceError,
  NotFoundError,
  ValidationError,
  DatabaseError,
} from "../errors";
import { logger } from "../utils/logger";

const isDevelopment = process.env["NODE_ENV"] === "development";

/**
 * Log error with context.
 */
function logError(err: Error, req: Request): void {
  // Check for user property (may exist on authenticated requests)
  const authenticatedReq = req as Request & { user?: { id: number } };

  // Use 'err' key so pino's error serializer handles it properly
  const logContext = {
    method: req.method,
    path: req.path,
    url: req.url,
    statusCode: err instanceof ServiceError ? err.statusCode : 500,
    err: err, // Pass error directly so serializer handles it
    ...(authenticatedReq.user && { userId: authenticatedReq.user.id }),
  };

  if (err instanceof ServiceError && err.statusCode < 500) {
    // Client errors (4xx) - log as warning
    logger.warn(logContext, "Client error");
  } else {
    // Server errors (5xx) - log as error with full details
    logger.error(logContext, "Server error");

    // Log original error for database errors
    if (err instanceof DatabaseError && err.originalError) {
      logger.error(
        {
          originalError:
            err.originalError instanceof Error
              ? err.originalError
              : new Error(String(err.originalError)),
        },
        "Original database error",
      );
    }
  }
}

/**
 * Build error response object.
 */
function buildErrorResponse(err: Error): Record<string, unknown> {
  const errorMessage = err.message || String(err) || "Unknown error";
  const errorName = err.name || "Error";

  const response: {
    error: string;
    message: string;
    details?: unknown;
    stack?: string;
  } = {
    error: errorName,
    message: errorMessage,
  };

  // Add details for validation errors
  if (err instanceof ValidationError && err.errors) {
    response.details = err.errors;
  }

  // Add stack trace in development mode
  if (isDevelopment && err.stack) {
    response.stack = err.stack;
  }

  return response;
}

/**
 * Error handler middleware.
 * Must be added after all routes.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logError(err, req);

  // Determine status code
  const statusCode = err instanceof ServiceError ? err.statusCode : 500;

  // Build response
  const response = buildErrorResponse(err);

  // Send response
  res.status(statusCode).json(response);
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const err = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(err);
}

/**
 * Async error wrapper.
 * Wraps async route handlers to catch errors and pass them to error handler.
 *
 * @param fn - Async route handler function
 * @returns Wrapped function
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}
