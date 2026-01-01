/**
 * Admin tasks SSE endpoint.
 *
 * Provides Server-Sent Events for real-time task updates.
 * Requires superuser authentication.
 */

import { Router, type Request, type Response } from "express";

import { loadUser, requireAuth, requireSuperuser } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getEventEmitter } from "../services/eventEmitter.service";
import { logger } from "../utils/logger";

const router = Router();

/**
 * SSE endpoint for task events.
 * GET /api/admin/tasks/events
 */
router.get(
  "/events",
  loadUser,
  requireAuth,
  requireSuperuser,
  asyncHandler(async (req: Request, res: Response) => {
    // IMPORTANT: Don't send response headers after this point - SSE needs to keep connection open
    // Set SSE headers BEFORE any writes
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Send initial connection event
    res.write(`event: connected\n`);
    res.write(
      `data: ${JSON.stringify({ message: "Connected to task events stream", timestamp: new Date().toISOString() })}\n\n`,
    );

    // Subscribe to events
    const eventEmitter = getEventEmitter();
    const unsubscribe = eventEmitter.subscribe((event, data) => {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        logger.error({ error, event }, "Error sending SSE event");
        unsubscribe();
      }
    });

    // Handle client disconnect
    req.on("close", () => {
      unsubscribe();
      res.end();
    });

    // Keep connection alive with periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeatInterval);
        unsubscribe();
        res.end();
      }
    }, 30000); // 30 seconds

    // Clean up on disconnect
    req.on("close", () => {
      clearInterval(heartbeatInterval);
    });
  }),
);

export function adminTasksSSERoutes(): Router {
  return router;
}
