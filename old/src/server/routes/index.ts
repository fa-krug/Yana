/**
 * Main API routes.
 *
 * Note: /api/v1/* routes have been migrated to tRPC.
 * This file is kept for backward compatibility but no longer sets up v1 routes.
 * Non-v1 routes (ai, youtube, rss, greader) are set up directly in server.ts.
 */

import { Router } from "express";

const router = Router();

// Health check (already handled in server.ts, but available here too)
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api" });
});

// All /api/v1/* routes have been migrated to tRPC
// See src/server/trpc/ for tRPC routers

export function setupRoutes(): Router {
  return router;
}
