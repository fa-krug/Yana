/**
 * Pino logger setup for structured logging.
 *
 * Provides centralized logging with different log levels and
 * environment-based configuration.
 */

import pino from "pino";

const isDevelopment = process.env["NODE_ENV"] === "development";
const logLevel = process.env["LOG_LEVEL"] || (isDevelopment ? "debug" : "info");

/**
 * Extract enumerable properties from error object.
 */
function extractExtraProps(error: Error, serialized: Record<string, unknown>): void {
  const seen = new WeakSet<object>();
  try {
    const errorRecord = error as unknown as Record<string, unknown>;
    for (const key in error) {
      if (key === "name" || key === "message" || key === "stack") continue;
      
      const value = errorRecord[key];
      if (value && typeof value === "object") {
        if (seen.has(value as object)) continue;
        seen.add(value as object);
      }
      serialized[key] = value;
    }
  } catch { /* Ignore */ }
}

/**
 * Serialize error objects for logging.
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    try { return { value: String(error) }; } catch { return { value: "[Unable to serialize error]" }; }
  }

  const serialized: Record<string, unknown> = { name: error.name, message: error.message };
  if (error.stack) serialized["stack"] = error.stack;

  // Include known custom properties
  const err = error as { statusCode?: number; feedId?: number; originalError?: unknown };
  if ("statusCode" in error) serialized["statusCode"] = err.statusCode;
  if ("feedId" in error) serialized["feedId"] = err.feedId;
  if ("originalError" in error && err.originalError) {
    serialized["originalError"] = serializeError(err.originalError);
  }

  extractExtraProps(error, serialized);
  return serialized;
}

/**
 * Logger configuration.
 * In development, uses pino-pretty for human-readable logs.
 * In production, uses plain JSON logging.
 *
 * Note: pino-pretty works with ESM when using the transport.target string option,
 * as pino handles the module loading internally.
 */
const loggerConfig: pino.LoggerOptions = {
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  serializers: {
    error: serializeError,
    err: serializeError, // Support pino's standard "err" key as well
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Add pretty printing transport in development mode
// Using transport.target as a string works with ESM - pino handles the module loading
if (isDevelopment) {
  loggerConfig.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname",
      singleLine: false,
    },
  };
}

/**
 * Main logger instance.
 * In development, uses pino-pretty for human-readable logs.
 * In production, uses plain JSON logging.
 */
export const logger = pino(loggerConfig);

/**
 * Create a child logger with additional context.
 *
 * @param context - Additional context to include in all log messages
 * @returns Child logger instance
 */
export function createLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

/**
 * Log levels available.
 */
export const LogLevel = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
