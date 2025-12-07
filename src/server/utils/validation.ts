/**
 * Zod validation utilities.
 *
 * Provides type-safe input validation using Zod schemas.
 */

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors';

/**
 * Validation middleware factory.
 * Validates request body, query, or params against a Zod schema.
 *
 * @param schema - Zod schema to validate against
 * @param source - Where to validate ('body', 'query', or 'params')
 * @returns Express middleware function
 */
export function validate(schema: z.ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.issues.map((err) => ({
          path: err.path.map(String).join('.'),
          message: err.message,
        }));

        throw new ValidationError('Validation failed', errors);
      }

      // Replace request data with validated data
      req[source] = result.data as never;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate request body.
 *
 * @param schema - Zod schema for body validation
 * @returns Express middleware
 */
export function validateBody(schema: z.ZodSchema) {
  return validate(schema, 'body');
}

/**
 * Validate query parameters.
 *
 * @param schema - Zod schema for query validation
 * @returns Express middleware
 */
export function validateQuery(schema: z.ZodSchema) {
  return validate(schema, 'query');
}

/**
 * Validate route parameters.
 *
 * @param schema - Zod schema for params validation
 * @returns Express middleware
 */
export function validateParams(schema: z.ZodSchema) {
  return validate(schema, 'params');
}

/**
 * Common validation schemas.
 */
export const commonSchemas = {
  id: z.coerce.number().int().positive(),
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }),
  dateRange: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};
