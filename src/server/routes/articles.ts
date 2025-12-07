/**
 * Article routes.
 *
 * Handles article management endpoints.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, loadUser } from "../middleware/auth";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../utils/validation";
import {
  articleListSchema,
  markArticlesSchema,
  idParamSchema,
} from "../validation/schemas";
import { z } from "zod";
import {
  listArticles,
  getArticle,
  markArticlesRead,
  markArticlesSaved,
  deleteArticle,
  reloadArticle,
  getArticleNavigation,
  markArticleReadOnView,
  enrichArticleData,
} from "../services/article.service";
import {
  parsePagination,
  formatPaginatedResponse,
} from "../middleware/pagination";
import type { AuthenticatedRequest } from "../middleware/auth";
import { logger } from "../utils/logger";

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
    const { feedId, feedType, isRead, isSaved, search } = req.query;

    const result = await listArticles(req.user!, {
      feedId: feedId ? parseInt(feedId as string) : undefined,
      feedType: feedType as string | undefined,
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
 * Auto-marks article as read when viewed (matching Django behavior)
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const articleId = parseInt(id);

    try {
      logger.debug({ articleId, userId: req.user?.id }, "Fetching article");
      const article = await getArticle(articleId, req.user!);

      // Get feed information
      logger.debug({ articleId, feedId: article.feedId }, "Fetching feed");
      const { getFeed } = await import("../services/feed.service");
      const feed = await getFeed(article.feedId, req.user!);

      // Get navigation
      logger.debug({ articleId }, "Fetching navigation");
      const navigation = await getArticleNavigation(article, req.user!);

      // Enrich article data (read state, computed fields)
      logger.debug({ articleId }, "Enriching article data");
      const enrichment = await enrichArticleData(article, req.user!);

      // Mark as read automatically when viewing (matching Django behavior)
      logger.debug({ articleId }, "Marking article as read");
      await markArticleReadOnView(articleId, req.user!);

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
    await markArticlesRead(req.user!, articleIds, isRead);
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
    await markArticlesSaved(req.user!, articleIds, isSaved);
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
    await deleteArticle(parseInt(id), req.user!);
    res.status(204).send();
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
    const result = await reloadArticle(parseInt(id), req.user!);
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
    const article = await getArticle(parseInt(id), req.user!);
    const navigation = await getArticleNavigation(article, req.user!);
    res.json(navigation);
  }),
);

export function articleRoutes(): Router {
  return router;
}
