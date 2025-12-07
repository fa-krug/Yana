/**
 * Statistics routes.
 *
 * Handles statistics endpoints.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, loadUser } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { getStatistics } from '../services/statistics.service';

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
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const statistics = await getStatistics(req.user!);
    res.json(statistics);
  })
);

export function statisticsRoutes(): Router {
  return router;
}
