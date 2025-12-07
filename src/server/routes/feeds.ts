/**
 * Feed routes.
 *
 * Handles feed management endpoints.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, loadUser } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../utils/validation';
import {
  createFeedSchema,
  updateFeedSchema,
  articleListSchema,
  idParamSchema,
} from '../validation/schemas';
import {
  listFeeds,
  getFeed,
  createFeed,
  updateFeed,
  deleteFeed,
  previewFeed,
  reloadFeed,
  clearFeedArticles,
  getFeedAggregatorMetadata,
  getFeedArticleCount,
  getFeedUnreadCount,
} from '../services/feed.service';
import { listArticles } from '../services/article.service';
import { parsePagination, formatPaginatedResponse } from '../middleware/pagination';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(loadUser);
router.use(requireAuth);

/**
 * GET /api/v1/feeds
 * List feeds with pagination and filters, including article counts
 */
router.get(
  '/',
  validateQuery(
    articleListSchema.pick({ page: true, pageSize: true }).extend({
      search: articleListSchema.shape.search,
      feedType: articleListSchema.shape.feedType,
      enabled: articleListSchema.shape.isRead, // Reuse schema
    })
  ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const pagination = parsePagination(req);
    const { search, feedType, enabled } = req.query;

    const result = await listFeeds(req.user!, {
      search: search as string | undefined,
      feedType: feedType as string | undefined,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
      ...pagination,
    });

    // Enrich feeds with article counts (matching Django behavior)
    const enrichedFeeds = await Promise.all(
      result.feeds.map(async feed => {
        const articleCount = await getFeedArticleCount(feed.id);
        const unreadCount = await getFeedUnreadCount(feed.id, req.user!.id);
        return {
          ...feed,
          articleCount: articleCount,
          unreadCount: unreadCount,
        };
      })
    );

    res.json(formatPaginatedResponse(enrichedFeeds, result.total, pagination));
  })
);

/**
 * GET /api/v1/feeds/:id
 * Get feed details with aggregator metadata and counts
 */
router.get(
  '/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const feed = await getFeed(parseInt(id), req.user!);

    // Get aggregator metadata
    const aggregatorMetadata = await getFeedAggregatorMetadata(feed);

    // Get article counts
    const articleCount = await getFeedArticleCount(parseInt(id));
    const unreadCount = await getFeedUnreadCount(parseInt(id), req.user!.id);

    // Build response with camelCase
    const response = {
      ...feed,
      aggregatorMetadata: aggregatorMetadata,
      articleCount: articleCount,
      unreadCount: unreadCount,
    };

    res.json(response);
  })
);

/**
 * POST /api/v1/feeds
 * Create new feed
 */
router.post(
  '/',
  validateBody(createFeedSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const feed = await createFeed(req.user!, req.body);
    res.status(201).json(feed);
  })
);

/**
 * PATCH /api/v1/feeds/:id
 * Update feed
 */
router.patch(
  '/:id',
  validateParams(idParamSchema),
  validateBody(updateFeedSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const feed = await updateFeed(parseInt(id), req.user!, req.body);
    res.json(feed);
  })
);

/**
 * DELETE /api/v1/feeds/:id
 * Delete feed
 */
router.delete(
  '/:id',
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    await deleteFeed(parseInt(id), req.user!);
    res.status(204).send();
  })
);

/**
 * POST /api/v1/feeds/preview
 * Preview feed (test aggregation)
 */
router.post(
  '/preview',
  validateBody(createFeedSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await previewFeed(req.user!, req.body);
    res.json(result);
  })
);

/**
 * POST /api/v1/feeds/:id/reload
 * Reload feed (trigger aggregation)
 */
router.post(
  '/:id/reload',
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const force = (req.query['force'] as string) === 'true';
    const result = await reloadFeed(parseInt(id), req.user!, force);
    res.json(result);
  })
);

/**
 * POST /api/v1/feeds/:id/clear
 * Clear all articles from feed
 */
router.post(
  '/:id/clear',
  validateParams(idParamSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    await clearFeedArticles(parseInt(id), req.user!);
    res.json({ success: true, message: 'Articles cleared' });
  })
);

/**
 * GET /api/v1/feeds/:feedId/articles
 * List articles for a feed
 */
router.get(
  '/:feedId/articles',
  validateParams(idParamSchema.extend({ feedId: articleListSchema.shape.feedId })),
  validateQuery(articleListSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { feedId } = req.params;
    const pagination = parsePagination(req);
    const { search, isRead, isSaved } = req.query;

    const result = await listArticles(req.user!, {
      feedId: parseInt(feedId),
      search: search as string | undefined,
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      isSaved: isSaved !== undefined ? isSaved === 'true' : undefined,
      ...pagination,
    });

    res.json(formatPaginatedResponse(result.articles, result.total, pagination));
  })
);

export function feedRoutes(): Router {
  return router;
}
