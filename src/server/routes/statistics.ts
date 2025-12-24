/**
 * Statistics routes.
 *
 * Handles statistics endpoints.
 */

import { Router } from "express";
import type { Response } from "express";

import { AuthenticationError } from "../errors";
import { requireAuth, loadUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getStatistics } from "../services/statistics.service";

/**
 * Get authenticated user from request.
 * Throws if user is not present (should not happen after requireAuth).
 */
function getAuthenticatedUser(
  req: AuthenticatedRequest,
): NonNullable<AuthenticatedRequest["user"]> {
  if (!req.user) {
    throw new AuthenticationError("User not found in request");
  }
  return req.user;
}

const router = Router();

// All routes require authentication
router.use(loadUser);
router.use(requireAuth);

/**
 * GET /api/v1/statistics
 * Get dashboard statistics for the current user
 * Cached for 60 seconds per user to reduce database load.
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = getAuthenticatedUser(req);
    const statistics = await getStatistics(user);
    res.json(statistics);
  }),
);

export function statisticsRoutes(): Router {
  return router;
}
