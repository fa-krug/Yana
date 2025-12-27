/**
 * Google Reader API routes.
 *
 * Implements Google Reader API for RSS reader compatibility.
 */

import { Router } from "express";
import type { Request, Response } from "express";

import { NotFoundError, PermissionDeniedError } from "../errors";
import { loadUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  authenticateWithCredentials,
  authenticateRequest,
  generateSessionToken,
} from "../services/greader/auth.service";

const router = Router();

// Load user but don't require auth (some endpoints handle auth themselves)
router.use(loadUser);

/**
 * POST /api/greader/accounts/ClientLogin
 * Client login endpoint
 */
router.post(
  "/accounts/ClientLogin",
  asyncHandler(async (req: Request, res: Response) => {
    const email = req.body.Email || req.body.email || "";
    const password = req.body.Passwd || req.body.passwd || "";

    const result = await authenticateWithCredentials(email, password);

    if (!result) {
      res.status(401);
      res.setHeader("Content-Type", "text/plain");
      res.send("Error=BadAuthentication");
      return;
    }

    // Return in expected format
    const responseText = `SID=${result.token}\nLSID=null\nAuth=${result.token}\n`;

    res.setHeader("Content-Type", "text/plain");
    res.send(responseText);
  }),
);

/**
 * GET /api/greader/reader/api/0/token
 * Get session token
 */
router.get(
  "/reader/api/0/token",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401);
      res.setHeader("Content-Type", "text/plain");
      res.send("Unauthorized");
      return;
    }

    const token = generateSessionToken(user.id);
    res.setHeader("Content-Type", "text/plain");
    res.send(token);
  }),
);

/**
 * GET /api/greader/reader/api/0/user-info
 * Get user info
 */
router.get(
  "/reader/api/0/user-info",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get user email
    const { getUserById } = await import("../services/user.service");
    const fullUser = await getUserById(user.id);

    res.json({
      userId: String(user.id),
      userName: user.username,
      userProfileId: String(user.id),
      userEmail: fullUser.email || `${user.username}@localhost`,
    });
  }),
);

/**
 * GET /api/greader/reader/api/0/subscription/list
 * List subscriptions
 */
router.get(
  "/reader/api/0/subscription/list",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { listSubscriptions } =
      await import("../services/greader/subscription.service");
    const subscriptions = await listSubscriptions(user.id);

    res.json({ subscriptions });
  }),
);

/**
 * POST /api/greader/reader/api/0/subscription/edit
 * Edit subscription
 */
router.post(
  "/reader/api/0/subscription/edit",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401);
      res.setHeader("Content-Type", "text/plain");
      res.send("Unauthorized");
      return;
    }

    const { editSubscription } =
      await import("../services/greader/subscription.service");
    try {
      await editSubscription(user.id, {
        streamId: req.body.s || req.body.stream_id || "",
        action: req.body.ac || req.body.action || "edit",
        newTitle: req.body.t || req.body.new_title || "",
        addLabel: req.body.a || req.body.add_label || "",
        removeLabel: req.body.r || req.body.remove_label || "",
      });

      res.setHeader("Content-Type", "text/plain");
      res.send("OK");
    } catch (error: unknown) {
      if (
        error instanceof NotFoundError ||
        error instanceof PermissionDeniedError
      ) {
        res.status(error instanceof NotFoundError ? 404 : 403);
        res.setHeader("Content-Type", "text/plain");
        res.send(error.message);
      } else {
        throw error;
      }
    }
  }),
);

/**
 * GET /api/greader/reader/api/0/tag/list
 * List tags
 */
router.get(
  "/reader/api/0/tag/list",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { listTags } = await import("../services/greader/tag.service");
    const tags = await listTags(user.id);

    res.json({ tags });
  }),
);

/**
 * POST /api/greader/reader/api/0/edit-tag
 * Edit tags (mark as read/starred)
 */
router.post(
  "/reader/api/0/edit-tag",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401);
      res.setHeader("Content-Type", "text/plain");
      res.send("Unauthorized");
      return;
    }

    // Normalize itemIds to always be an array
    // For form-urlencoded POST, req.body.i might be a string (single or comma-separated)
    const itemIdsRaw = req.body.i || req.body.item_ids || [];
    let itemIds: string[];
    if (Array.isArray(itemIdsRaw)) {
      itemIds = itemIdsRaw;
    } else if (typeof itemIdsRaw === "string") {
      // Handle comma-separated strings
      itemIds = itemIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else {
      itemIds = [];
    }

    const addTag = req.body.a || req.body.add_tag || "";
    const removeTag = req.body.r || req.body.remove_tag || "";

    const { editTags } = await import("../services/greader/tag.service");
    await editTags(user.id, itemIds, addTag, removeTag);

    res.setHeader("Content-Type", "text/plain");
    res.send("OK");
  }),
);

/**
 * POST /api/greader/reader/api/0/mark-all-as-read
 * Mark all as read
 */
router.post(
  "/reader/api/0/mark-all-as-read",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401);
      res.setHeader("Content-Type", "text/plain");
      res.send("Unauthorized");
      return;
    }

    const streamId = req.body.s || req.body.stream_id || "";
    const timestamp = req.body.ts || req.body.timestamp || "";

    const { markAllAsRead } = await import("../services/greader/tag.service");
    await markAllAsRead(user.id, streamId, timestamp);

    res.setHeader("Content-Type", "text/plain");
    res.send("OK");
  }),
);

/**
 * GET /api/greader/reader/api/0/unread-count
 * Get unread counts
 */
router.get(
  "/reader/api/0/unread-count",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const includeAll = req.query["all"] === "1";

    const { getUnreadCount } =
      await import("../services/greader/stream.service");
    const result = await getUnreadCount(user.id, includeAll);

    res.json(result);
  }),
);

/**
 * GET /api/greader/reader/api/0/stream/items/ids
 * Get stream item IDs
 */
router.get(
  "/reader/api/0/stream/items/ids",
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const streamId =
      (req.query["s"] as string) || "user/-/state/com.google/reading-list";
    const limit = Math.min(
      parseInt((req.query["n"] as string) || "1000", 10),
      10000,
    );
    const olderThan = (req.query["ot"] as string) || "";
    const excludeTag = (req.query["xt"] as string) || "";
    const includeTag = (req.query["it"] as string) || "";
    const reverseOrder = req.query["r"] === "o";

    const { getStreamItemIds } =
      await import("../services/greader/stream.service");
    const response = await getStreamItemIds(
      user.id,
      streamId,
      limit,
      olderThan,
      excludeTag,
      includeTag,
      reverseOrder,
    );

    res.json(response);
  }),
);

/**
 * GET /api/greader/reader/api/0/stream/contents
 * GET /api/greader/reader/api/0/stream/items/contents
 * Get stream contents
 */
const streamContentsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const session = (req as AuthenticatedRequest).session;
    const user = await authenticateRequest(authHeader, session?.userId);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const streamId = (req.params["streamId"] as string) || "";
    // Ensure itemIds is always an array
    // For form-urlencoded POST, req.body["i"] might be a string if single value
    const itemIdsRaw = req.query["i"] || req.body["i"] || [];
    let itemIds: (string | string[])[];
    if (Array.isArray(itemIdsRaw)) {
      itemIds = itemIdsRaw;
    } else if (itemIdsRaw) {
      itemIds = [itemIdsRaw];
    } else {
      itemIds = [];
    }
    const excludeTag =
      (req.query["xt"] as string) || (req.body["xt"] as string) || "";
    const limit = parseInt(
      (req.query["n"] as string) || (req.body["n"] as string) || "50",
      10,
    );
    const olderThan =
      (req.query["ot"] as string) || (req.body["ot"] as string) || "";
    const continuation =
      (req.query["c"] as string) || (req.body["c"] as string) || "";

    const { getStreamContents } =
      await import("../services/greader/stream.service");
    const response = await getStreamContents(
      user.id,
      streamId,
      itemIds,
      excludeTag,
      limit,
      olderThan,
      continuation,
    );

    res.json(response);
  },
);

router.get("/reader/api/0/stream/contents", streamContentsHandler);
router.get("/reader/api/0/stream/contents/:streamId", streamContentsHandler);
router.post("/reader/api/0/stream/contents", streamContentsHandler);
router.post("/reader/api/0/stream/contents/:streamId", streamContentsHandler);
router.get("/reader/api/0/stream/items/contents", streamContentsHandler);
router.post("/reader/api/0/stream/items/contents", streamContentsHandler);

export function greaderRoutes(): Router {
  return router;
}
