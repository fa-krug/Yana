/**
 * Authentication routes.
 *
 * Handles login, logout, and auth status.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { validateBody } from "../utils/validation";
import { loginSchema } from "../validation/schemas";
import { authenticateUser } from "../services/user.service";
import { loadUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../middleware/auth";
import type { Session } from "express-session";
import { logger } from "../utils/logger";

const router = Router();

/**
 * POST /api/v1/auth/login
 * Login endpoint
 */
router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      logger.debug({ username }, "Login attempt started");

      const user = await authenticateUser(username, password);
      logger.debug(
        { userId: user.id, username: user.username },
        "User authenticated",
      );

      // Set session
      const session = req.session as Session & {
        userId?: number;
        isSuperuser?: boolean;
      };
      logger.debug({ sessionId: session.id }, "Setting session properties");

      session.userId = user.id;
      session.isSuperuser = user.isSuperuser;

      logger.debug(
        { sessionId: session.id, userId: user.id },
        "Session properties set, saving...",
      );

      // Explicitly save the session and handle errors
      await new Promise<void>((resolve, reject) => {
        session.save((err) => {
          if (err) {
            // Log detailed error information
            const errorDetails = {
              message: err?.message || "Unknown error",
              name: err?.name || "Error",
              stack: err?.stack,
              sessionId: session.id,
              userId: user.id,
              username: user.username,
              errorType: err?.constructor?.name,
              errorString: String(err),
            };
            logger.error(errorDetails, "Failed to save session during login");

            // Create a proper Error object if needed
            const errorToReject =
              err instanceof Error ? err : new Error(String(err));
            reject(errorToReject);
          } else {
            logger.debug(
              { sessionId: session.id, userId: user.id },
              "Session saved successfully",
            );
            resolve();
          }
        });
      });

      logger.debug({ userId: user.id }, "Sending login response");
      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_superuser: user.isSuperuser,
          is_staff: user.isStaff,
        },
      });
    } catch (error) {
      // Log the error with full details before rethrowing
      const err = error as Error;
      logger.error(
        {
          error: err.message,
          name: err.name,
          stack: err.stack,
          errorString: String(err),
          errorType: err.constructor?.name,
        },
        "Error in login handler",
      );
      throw error;
    }
  }),
);

/**
 * POST /api/v1/auth/logout
 * Logout endpoint
 */
router.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: "Failed to logout" });
        return;
      }
      res.clearCookie("yana.sid");
      res.json({ message: "Logged out successfully" });
    });
  }),
);

/**
 * GET /api/v1/auth/status
 * Get authentication status
 */
router.get(
  "/status",
  loadUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.user) {
      res.json({
        authenticated: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          is_superuser: req.user.isSuperuser,
          is_staff: req.user.isStaff,
        },
      });
    } else {
      res.json({
        authenticated: false,
        user: null,
      });
    }
  }),
);

/**
 * GET /api/v1/auth/csrf
 * Get CSRF token (optional, for SSR)
 */
router.get("/csrf", (req: Request, res: Response) => {
  // CSRF token is handled by express-session
  // In SSR, cookies are automatically forwarded
  res.json({ csrf: "not-needed-with-cookies" });
});

export function authRoutes(): Router {
  return router;
}
