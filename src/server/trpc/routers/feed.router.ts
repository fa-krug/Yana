/**
 * Feed router.
 *
 * Handles feed management endpoints.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../procedures";
import { getAuthenticatedUser } from "../procedures";
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
} from "../../services/feed.service";
import {
  listArticles,
  enrichArticleData,
} from "../../services/article.service";
import {
  createFeedSchema,
  updateFeedSchema,
  articleListSchema,
  idParamSchema,
} from "../../validation/schemas";
import { NotFoundError, PermissionDeniedError } from "../../errors";

/**
 * Feed list input schema.
 */
const feedListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().nullish(),
  feedType: z.enum(["article", "youtube", "podcast", "reddit"]).nullish(),
  enabled: z.boolean().nullish(),
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
 * Convert feed object to API format (null to undefined for icon, dates to strings).
 */
const formatFeed = (feed: any) => {
  return {
    ...feed,
    icon: feed.icon ?? undefined,
    createdAt: toISOString(feed.createdAt),
    updatedAt: toISOString(feed.updatedAt),
    lastAggregated: feed.lastAggregated
      ? toISOString(feed.lastAggregated)
      : undefined,
  };
};

/**
 * Feed router.
 */
export const feedRouter = router({
  /**
   * List feeds with pagination and filters, including article counts.
   */
  list: protectedProcedure
    .input(feedListInputSchema)
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      const result = await listFeeds(user, {
        search: input.search ?? undefined,
        feedType: input.feedType ?? undefined,
        enabled: input.enabled ?? undefined,
        page: input.page,
        pageSize: input.pageSize,
      });

      // Enrich feeds with article counts
      const enrichedFeeds = await Promise.all(
        result.feeds.map(async (feed) => {
          const articleCount = await getFeedArticleCount(feed.id);
          const unreadCount = await getFeedUnreadCount(feed.id, user.id);
          return formatFeed({
            ...feed,
            articleCount: articleCount,
            unreadCount: unreadCount,
          });
        }),
      );

      return {
        items: enrichedFeeds,
        count: result.total,
        page: input.page,
        pageSize: input.pageSize,
        pages: Math.ceil(result.total / input.pageSize),
      };
    }),

  /**
   * Get feed details with aggregator metadata and counts.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const feed = await getFeed(input.id, user);

        // Get aggregator metadata
        const aggregatorMetadata = await getFeedAggregatorMetadata(feed);

        // Get article counts
        const articleCount = await getFeedArticleCount(input.id);
        const unreadCount = await getFeedUnreadCount(input.id, user.id);

        return formatFeed({
          ...feed,
          aggregatorMetadata: aggregatorMetadata,
          articleCount: articleCount,
          unreadCount: unreadCount,
        });
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
   * Create new feed.
   */
  create: protectedProcedure
    .input(createFeedSchema)
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      const feed = await createFeed(user, input);
      return formatFeed(feed);
    }),

  /**
   * Update feed.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        data: updateFeedSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const feed = await updateFeed(input.id, user, input.data);
        return formatFeed(feed);
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
   * Delete feed.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        await deleteFeed(input.id, user);
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
   * Preview feed (test aggregation).
   */
  preview: protectedProcedure
    .input(createFeedSchema)
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      return await previewFeed(user, input);
    }),

  /**
   * Reload feed (trigger aggregation).
   */
  reload: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        return await reloadFeed(input.id, user, input.force);
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
   * Clear all articles from feed.
   */
  clear: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        await clearFeedArticles(input.id, user);
        return { success: true, message: "Articles cleared" };
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
   * List articles for a feed.
   */
  listArticles: protectedProcedure
    .input(
      z.object({
        feedId: z.number().int().positive(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(20),
        search: z.string().optional(),
        isRead: z.boolean().optional(),
        isSaved: z.boolean().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      const result = await listArticles(user, {
        feedId: input.feedId,
        search: input.search,
        isRead: input.isRead,
        isSaved: input.isSaved,
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
});
