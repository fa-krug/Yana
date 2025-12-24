/**
 * Article router.
 *
 * Handles article management endpoints.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { NotFoundError, PermissionDeniedError } from "@server/errors";
import {
  listArticles,
  getArticle,
  updateArticle,
  createArticle,
  markArticlesRead,
  markArticlesSaved,
  deleteArticle,
  deleteArticles,
  reloadArticle,
  reloadArticles,
  markFilteredRead,
  deleteFiltered,
  refreshFiltered,
  getArticleNavigation,
  markArticleReadOnView,
  enrichArticleData,
} from "@server/services/article.service";
import { getFeed } from "@server/services/feed.service";
import { getTask } from "@server/services/taskQueue.service";
import { logger } from "@server/utils/logger";

import {
  router,
  protectedProcedure,
  getAuthenticatedUser,
} from "../procedures";

/**
 * Article list input schema.
 */
const articleListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  feedId: z.number().int().positive().nullish(),
  feedType: z.enum(["article", "youtube", "podcast", "reddit"]).nullish(),
  groupId: z.number().int().positive().nullish(),
  isRead: z.boolean().nullish(),
  isSaved: z.boolean().nullish(),
  search: z.string().nullish(),
  dateFrom: z.string().datetime().nullish(),
  dateTo: z.string().datetime().nullish(),
});

/**
 * Helper to convert date to ISO string.
 */
const toISOString = (
  date: Date | number | string | null | undefined,
): string => {
  if (!date) return new Date().toISOString();
  if (date instanceof Date) return date.toISOString();
  if (typeof date === "number") return new Date(date).toISOString();
  if (typeof date === "string") return date;
  return new Date().toISOString();
};

/**
 * Article router.
 */
export const articleRouter = router({
  /**
   * List articles with pagination and filters.
   */
  list: protectedProcedure
    .input(articleListInputSchema)
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      const result = await listArticles(user, {
        feedId: input.feedId ?? undefined,
        feedType: input.feedType ?? undefined,
        groupId: input.groupId ?? undefined,
        isRead: input.isRead ?? undefined,
        isSaved: input.isSaved ?? undefined,
        search: input.search ?? undefined,
        dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        page: input.page,
        pageSize: input.pageSize,
      });

      // Enrich articles with computed fields and convert dates
      const enrichedArticles = await Promise.all(
        result.articles.map(async (article) => {
          const enrichment = await enrichArticleData(article, user);
          return {
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
            // Frontend-friendly aliases
            read: enrichment.isRead,
            saved: enrichment.isSaved,
            title: article.name,
            published: toISOString(article.date),
            link: article.url,
            summary: undefined,
          };
        }),
      );

      return {
        items: enrichedArticles,
        count: result.total,
        page: input.page,
        pageSize: input.pageSize,
        pages: Math.ceil(result.total / input.pageSize),
      };
    }),

  /**
   * Get article details with navigation and enrichment.
   * Auto-marks article as read when viewed.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      const articleId = input.id;

      try {
        logger.debug({ articleId, userId: user.id }, "Fetching article");
        const article = await getArticle(articleId, user);

        // Get feed information
        logger.debug({ articleId, feedId: article.feedId }, "Fetching feed");
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
        return response;
      } catch (error) {
        logger.error(
          {
            articleId,
            userId: user.id,
            err: error instanceof Error ? error : new Error(String(error)),
          },
          "Error fetching article",
        );

        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Mark articles as read/unread.
   */
  markRead: protectedProcedure
    .input(
      z.object({
        articleIds: z.array(z.number().int().positive()).min(1),
        isRead: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      await markArticlesRead(user, input.articleIds, input.isRead);
      return { success: true };
    }),

  /**
   * Mark articles as saved/unsaved.
   */
  markSaved: protectedProcedure
    .input(
      z.object({
        articleIds: z.array(z.number().int().positive()).min(1),
        isSaved: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      await markArticlesSaved(user, input.articleIds, input.isSaved);
      return { success: true };
    }),

  /**
   * Delete article.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        await deleteArticle(input.id, user);
        return { success: true };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Create a new article.
   */
  create: protectedProcedure
    .input(
      z.object({
        feedId: z.number().int().positive(),
        name: z.string().min(1),
        url: z.string().url(),
        date: z.coerce.date(),
        content: z.string(),
        thumbnailUrl: z.string().url().nullable().optional(),
        mediaUrl: z.string().url().nullable().optional(),
        duration: z.number().int().positive().nullable().optional(),
        viewCount: z.number().int().nonnegative().nullable().optional(),
        mediaType: z.string().nullable().optional(),
        author: z.string().nullable().optional(),
        externalId: z.string().nullable().optional(),
        score: z.number().int().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const article = await createArticle(user, {
          feedId: input.feedId,
          name: input.name,
          url: input.url,
          date: input.date,
          content: input.content,
          thumbnailUrl: input.thumbnailUrl ?? null,
          mediaUrl: input.mediaUrl ?? null,
          duration: input.duration ?? null,
          viewCount: input.viewCount ?? null,
          mediaType: input.mediaType ?? null,
          author: input.author ?? null,
          externalId: input.externalId ?? null,
          score: input.score ?? null,
        });
        // Fetch the created article with full details
        const fullArticle = await getArticle(article.id, user);
        const feed = await getFeed(fullArticle.feedId, user);
        const navigation = await getArticleNavigation(fullArticle, user);
        const enrichment = await enrichArticleData(fullArticle, user);

        // Build response with camelCase (same structure as getById)
        return {
          id: fullArticle.id,
          feedId: fullArticle.feedId,
          name: fullArticle.name,
          url: fullArticle.url,
          date: toISOString(fullArticle.date),
          content: fullArticle.content,
          thumbnailUrl: fullArticle.thumbnailUrl || null,
          mediaUrl: fullArticle.mediaUrl || null,
          duration: fullArticle.duration || null,
          viewCount: fullArticle.viewCount || null,
          mediaType: fullArticle.mediaType || null,
          author: fullArticle.author || null,
          externalId: fullArticle.externalId || null,
          score: fullArticle.score || null,
          createdAt: toISOString(fullArticle.createdAt),
          updatedAt: toISOString(fullArticle.updatedAt),
          isRead: enrichment.isRead,
          isSaved: enrichment.isSaved,
          isVideo: enrichment.isVideo,
          isPodcast: enrichment.isPodcast,
          isReddit: enrichment.isReddit,
          hasMedia: enrichment.hasMedia,
          durationFormatted: enrichment.durationFormatted || null,
          feedName: feed.name,
          feedIcon: feed.icon || null,
          prevArticleId: navigation.prev?.id || null,
          nextArticleId: navigation.next?.id || null,
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Update article content.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        content: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        await updateArticle(input.id, user, {
          content: input.content,
        });
        // Fetch the updated article with full details (same as getById)
        const article = await getArticle(input.id, user);
        const feed = await getFeed(article.feedId, user);
        const navigation = await getArticleNavigation(article, user);
        const enrichment = await enrichArticleData(article, user);

        // Build response with camelCase (same structure as getById)
        return {
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
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Reload article (trigger re-aggregation).
   */
  reload: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        return await reloadArticle(input.id, user);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Get article navigation (prev/next).
   */
  getNavigation: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const article = await getArticle(input.id, user);
        return await getArticleNavigation(article, user);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Get task status by ID.
   */
  getTaskStatus: protectedProcedure
    .input(z.object({ taskId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const task = await getTask(input.taskId);
      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Task with id ${input.taskId} not found`,
        });
      }

      // Handle result - it might be a string (if stored as text) or already parsed (if mode: 'json' worked)
      let parsedResult: unknown = null;
      if (task.result) {
        if (typeof task.result === "string") {
          try {
            parsedResult = JSON.parse(task.result);
          } catch {
            parsedResult = task.result;
          }
        } else {
          parsedResult = task.result;
        }
      }

      return {
        id: task.id,
        status: task.status,
        type: task.type,
        error: task.error || null,
        result: parsedResult,
      };
    }),

  /**
   * Delete multiple articles in bulk.
   */
  deleteMany: protectedProcedure
    .input(
      z.object({
        articleIds: z.array(z.number().int().positive()).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const count = await deleteArticles(user, input.articleIds);
        return { success: true, count };
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Reload multiple articles in bulk.
   */
  reloadMany: protectedProcedure
    .input(
      z.object({
        articleIds: z.array(z.number().int().positive()).min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        return await reloadArticles(user, input.articleIds);
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Mark all filtered articles as read/unread (filter-based).
   */
  markFilteredRead: protectedProcedure
    .input(
      z.object({
        feedId: z.number().int().positive().nullish(),
        groupId: z.number().int().positive().nullish(),
        isRead: z.boolean().nullish(),
        isSaved: z.boolean().nullish(),
        search: z.string().nullish(),
        dateFrom: z.string().datetime().nullish(),
        dateTo: z.string().datetime().nullish(),
        isReadValue: z.boolean(), // The value to set (read or unread)
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const count = await markFilteredRead(
          user,
          {
            feedId: input.feedId ?? undefined,
            groupId: input.groupId ?? undefined,
            isRead: input.isRead ?? undefined,
            isSaved: input.isSaved ?? undefined,
            search: input.search ?? undefined,
            dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
            dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
          },
          input.isReadValue,
        );
        return { success: true, count };
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Delete all filtered articles (filter-based).
   */
  deleteFiltered: protectedProcedure
    .input(
      z.object({
        feedId: z.number().int().positive().nullish(),
        groupId: z.number().int().positive().nullish(),
        isRead: z.boolean().nullish(),
        isSaved: z.boolean().nullish(),
        search: z.string().nullish(),
        dateFrom: z.string().datetime().nullish(),
        dateTo: z.string().datetime().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const count = await deleteFiltered(user, {
          feedId: input.feedId ?? undefined,
          groupId: input.groupId ?? undefined,
          isRead: input.isRead ?? undefined,
          isSaved: input.isSaved ?? undefined,
          search: input.search ?? undefined,
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        });
        return { success: true, count };
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Refresh all filtered articles (filter-based).
   */
  refreshFiltered: protectedProcedure
    .input(
      z.object({
        feedId: z.number().int().positive().nullish(),
        groupId: z.number().int().positive().nullish(),
        isRead: z.boolean().nullish(),
        isSaved: z.boolean().nullish(),
        search: z.string().nullish(),
        dateFrom: z.string().datetime().nullish(),
        dateTo: z.string().datetime().nullish(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const result = await refreshFiltered(user, {
          feedId: input.feedId ?? undefined,
          groupId: input.groupId ?? undefined,
          isRead: input.isRead ?? undefined,
          isSaved: input.isSaved ?? undefined,
          search: input.search ?? undefined,
          dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
          dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
        });
        return { success: true, taskIds: result.taskIds, count: result.count };
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
