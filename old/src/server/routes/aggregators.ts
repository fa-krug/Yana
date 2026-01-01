/**
 * Aggregator routes.
 *
 * Provides aggregator metadata and options.
 */

import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";

import { loadUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  getAllAggregatorMetadata,
  getAggregatorOptions,
  getGroupedAggregatorMetadata,
  getAggregatorDetail,
} from "../services/aggregator.service";
import { validateParams } from "../utils/validation";

const router = Router();

// Load user but don't require auth (aggregator list is public)
router.use(loadUser);

/**
 * GET /api/v1/aggregators
 * List all available aggregators
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const aggregators = getAllAggregatorMetadata();
    res.json(aggregators);
  }),
);

/**
 * GET /api/v1/aggregators/grouped
 * List all available aggregators grouped by type
 */
router.get(
  "/grouped",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const grouped = getGroupedAggregatorMetadata();
    res.json(grouped);
  }),
);

/**
 * GET /api/v1/aggregators/:id
 * Get aggregator detail including identifier config and options
 */
router.get(
  "/:id",
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const detail = getAggregatorDetail(id);
    res.json(detail);
  }),
);

/**
 * GET /api/v1/aggregators/:id/options
 * Get aggregator options schema
 */
router.get(
  "/:id/options",
  validateParams(z.object({ id: z.string().min(1) })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const options = getAggregatorOptions(id);
    res.json(options || {});
  }),
);

export function aggregatorRoutes(): Router {
  return router;
}
