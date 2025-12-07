/**
 * Security middleware.
 *
 * Provides security headers, rate limiting, and XSS protection.
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Express } from 'express';

const isDevelopment = process.env['NODE_ENV'] === 'development';

/**
 * Apply security middleware to Express app.
 */
export function setupSecurity(app: Express): void {
  // Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: !isDevelopment,
      crossOriginEmbedderPolicy: false, // Allow embedding for iframes
    })
  );

  // Rate limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to API routes
  app.use('/api/', apiLimiter);

  // Stricter rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/v1/auth/login', authLimiter);
}
