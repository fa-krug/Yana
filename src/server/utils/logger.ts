/**
 * Pino logger setup for structured logging.
 *
 * Provides centralized logging with different log levels and
 * environment-based configuration.
 */

import pino from 'pino';

const isDevelopment = process.env['NODE_ENV'] === 'development';
const logLevel = process.env['LOG_LEVEL'] || (isDevelopment ? 'debug' : 'info');

/**
 * Serialize error objects for logging.
 * Extracts message, stack, and other properties from Error objects.
 * This ensures Error objects are properly serialized in JSON logs.
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      serialized['stack'] = error.stack;
    }

    // Include any additional properties from custom error classes
    if ('statusCode' in error) {
      serialized['statusCode'] = (error as { statusCode?: number }).statusCode;
    }

    if ('feedId' in error) {
      serialized['feedId'] = (error as { feedId?: number }).feedId;
    }

    if ('originalError' in error) {
      const originalError = (error as { originalError?: Error | unknown }).originalError;
      if (originalError) {
        serialized['originalError'] = serializeError(originalError);
      }
    }

    // Include any other enumerable properties (but avoid circular references)
    const seen = new WeakSet<object>();
    try {
      const errorRecord = error as unknown as Record<string, unknown>;
      for (const key in error) {
        if (
          key !== 'name' &&
          key !== 'message' &&
          key !== 'stack' &&
          !seen.has(errorRecord[key] as object)
        ) {
          const value = errorRecord[key];
          if (value && typeof value === 'object') {
            seen.add(value as object);
          }
          serialized[key] = value;
        }
      }
    } catch {
      // Ignore properties that can't be serialized
    }

    return serialized;
  }

  // For non-Error values, convert to string
  try {
    return { value: String(error) };
  } catch {
    return { value: '[Unable to serialize error]' };
  }
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
    level: label => {
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
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
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
export function createLogger(context: Record<string, unknown>) {
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
