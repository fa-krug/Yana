/**
 * Security middleware.
 *
 * Provides security headers, rate limiting, and XSS protection.
 */

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Express } from "express";

const isDevelopment = process.env["NODE_ENV"] === "development";

/**
 * Apply security middleware to Express app.
 */
export function setupSecurity(app: Express): void {
  // Default CSP policy (applied to most routes)
  const defaultCSP = !isDevelopment
    ? {
        directives: {
          defaultSrc: ["'self'"],
          // Allow 'unsafe-inline' for Angular component styles and event handlers
          // Angular generates inline styles and scripts at runtime
          scriptSrc: ["'self'", "'unsafe-inline'"],
          // Allow inline event handlers (onclick, onload, etc.) used by Angular/libraries
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          // Allow embedding YouTube proxy (same origin) and YouTube embeds
          frameSrc: ["'self'", "https://www.youtube-nocookie.com"],
          upgradeInsecureRequests: [],
        },
      }
    : false;

  // CSP policy for YouTube proxy route (allows embedding from any origin)
  const youtubeProxyCSP = !isDevelopment
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://www.youtube-nocookie.com"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["*"], // Allow embedding from any origin
          frameSrc: ["'self'", "https://www.youtube-nocookie.com"],
          upgradeInsecureRequests: [],
        },
      }
    : false;

  // Apply helmet with route-specific CSP
  app.use((req, res, next) => {
    // Check if this is the YouTube proxy route
    if (
      req.path === "/api/youtube-proxy" ||
      req.path.startsWith("/api/youtube-proxy")
    ) {
      helmet({
        contentSecurityPolicy: youtubeProxyCSP,
        crossOriginEmbedderPolicy: false,
        frameguard: false, // Disable X-Frame-Options header to allow embedding
      })(req, res, next);
    } else {
      helmet({
        contentSecurityPolicy: defaultCSP,
        crossOriginEmbedderPolicy: false, // Allow embedding for iframes
      })(req, res, next);
    }
  });

  // Rate limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to API routes
  app.use("/api/", apiLimiter);

  // Stricter rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: "Too many login attempts, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/v1/auth/login", authLimiter);
}
