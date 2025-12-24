/**
 * Article routes.
 *
 * Handles article management endpoints.
 */

import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";

import { AuthenticationError } from "../errors";
import { requireAuth, loadUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import {
  parsePagination,
  formatPaginatedResponse,
} from "../middleware/pagination";
import {
  listArticles,
  getArticle,
  updateArticle,
  createArticle,
  markArticlesRead,
  markArticlesSaved,
  deleteArticle,
  reloadArticle,
  getArticleNavigation,
  markArticleReadOnView,
  enrichArticleData,
} from "../services/article.service";
import { logger } from "../utils/logger";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../utils/validation";
import {
  articleListSchema,
  markArticlesSchema,
  idParamSchema,
  updateArticleSchema,
  createArticleSchema,
} from "../validation/schemas";

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
 * GET /api/v1/articles
 * List articles with pagination and filters
 */
router.get(
  "/",
  validateQuery(articleListSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const pagination = parsePagination(req);
    const { feedId, feedType, groupId, isRead, isSaved, search } = req.query;
    const user = getAuthenticatedUser(req);

    const result = await listArticles(user, {
      feedId: feedId ? parseInt(feedId as string) : undefined,
      feedType: feedType as string | undefined,
      groupId: groupId ? parseInt(groupId as string, 10) : undefined,
      isRead: isRead !== undefined ? isRead === "true" : undefined,
      isSaved: isSaved !== undefined ? isSaved === "true" : undefined,
      search: search as string | undefined,
      ...pagination,
    });

    res.json(
      formatPaginatedResponse(result.articles, result.total, pagination),
    );
  }),
);

/**
 * GET /api/v1/articles/:id
 * Get article details with navigation and enrichment
 * Auto-marks article as read when viewed
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const articleId = parseInt(id);

    try {
      const user = getAuthenticatedUser(req);
      logger.debug({ articleId, userId: user.id }, "Fetching article");
      const article = await getArticle(articleId, user);

      // Get feed information
      logger.debug({ articleId, feedId: article.feedId }, "Fetching feed");
      const { getFeed } = await import("../services/feed.service");
      const feed = await getFeed(article.feedId, user);

      // Get navigation
      logger.debug({ articleId }, "Fetching navigation");
      const navigation = await getArticleNavigation(article, user);

      // Enrich article data (read state, computed fields)
      logger.debug({ articleId }, "Enriching article data");
      const enrichment = await enrichArticleData(article, user);

      // Mark as read automatically when viewing
      logger.debug({ articleId }, "Marking article as read");
      await markArticleReadOnView(articleId, user);

      // Build response with camelCase
      // Helper to convert date (Date object or timestamp number) to ISO string
      const toISOString = (
        date: Date | number | string | null | undefined,
      ): string => {
        if (!date) return new Date().toISOString();
        if (date instanceof Date) return date.toISOString();
        if (typeof date === "number") return new Date(date).toISOString();
        if (typeof date === "string") return date;
        return new Date().toISOString();
      };

      const response = {
        id: article.id,
        feedId: article.feedId,
        name: article.name,
        url: article.url,
        date: toISOString(article.date),
        content: article.content,
        thumbnailUrl: article.thumbnailUrl || null,
        mediaUrl: article.mediaUrl || null,
        duration: article.duration || null,
        viewCount: article.viewCount || null,
        mediaType: article.mediaType || null,
        author: article.author || null,
        externalId: article.externalId || null,
        score: article.score || null,
        createdAt: toISOString(article.createdAt),
        updatedAt: toISOString(article.updatedAt),
        // Enrichment fields
        isRead: enrichment.isRead,
        isSaved: enrichment.isSaved,
        isVideo: enrichment.isVideo,
        isPodcast: enrichment.isPodcast,
        isReddit: enrichment.isReddit,
        hasMedia: enrichment.hasMedia,
        durationFormatted: enrichment.durationFormatted || null,
        // Navigation and feed info
        feedName: feed.name,
        feedIcon: feed.icon || null,
        prevArticleId: navigation.prev?.id || null,
        nextArticleId: navigation.next?.id || null,
      };

      logger.debug({ articleId }, "Article fetched successfully");
      res.json(response);
    } catch (error) {
      // Use 'err' key so pino's error serializer handles it properly
      logger.error(
        {
          articleId,
          userId: req.user?.id,
          err: error instanceof Error ? error : new Error(String(error)),
        },
        "Error fetching article",
      );
      throw error; // Re-throw to let errorHandler handle it
    }
  }),
);

/**
 * POST /api/v1/articles/mark-read
 * Mark articles as read/unread
 */
router.post(
  "/mark-read",
  validateBody(markArticlesSchema.extend({ isRead: z.boolean() })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { articleIds, isRead } = req.body;
    const user = getAuthenticatedUser(req);
    await markArticlesRead(user, articleIds, isRead);
    res.json({ success: true });
  }),
);

/**
 * POST /api/v1/articles/mark-starred
 * Mark articles as saved/unsaved
 */
router.post(
  "/mark-starred",
  validateBody(markArticlesSchema.extend({ isSaved: z.boolean() })),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { articleIds, isSaved } = req.body;
    const user = getAuthenticatedUser(req);
    await markArticlesSaved(user, articleIds, isSaved);
    res.json({ success: true });
  }),
);

/**
 * DELETE /api/v1/articles/:id
 * Delete article
 */
router.delete(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = getAuthenticatedUser(req);
    await deleteArticle(parseInt(id), user);
    res.status(204).send();
  }),
);

/**
 * POST /api/v1/articles
 * Create a new article
 */
router.post(
  "/",
  validateBody(createArticleSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = getAuthenticatedUser(req);
    const article = await createArticle(user, req.body);
    res.status(201).json(article);
  }),
);

/**
 * PATCH /api/v1/articles/:id
 * Update article content
 */
router.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateArticleSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = getAuthenticatedUser(req);
    const article = await updateArticle(parseInt(id), user, req.body);
    res.json(article);
  }),
);

/**
 * POST /api/v1/articles/:id/reload
 * Reload article (trigger re-aggregation)
 */
router.post(
  "/:id/reload",
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = getAuthenticatedUser(req);
    const result = await reloadArticle(parseInt(id), user);
    res.json(result);
  }),
);

/**
 * GET /api/v1/articles/:id/navigation
 * Get article navigation (prev/next)
 */
router.get(
  "/:id/navigation",
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = getAuthenticatedUser(req);
    const article = await getArticle(parseInt(id), user);
    const navigation = await getArticleNavigation(article, user);
    res.json(navigation);
  }),
);

export function articleRoutes(): Router {
  return router;
}
