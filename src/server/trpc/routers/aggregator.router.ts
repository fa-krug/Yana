/**
 * Aggregator router.
 *
 * Provides aggregator metadata and options.
 * All endpoints are public (no authentication required).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../procedures";
import {
  getAllAggregatorMetadata,
  getAggregatorDetail,
  getAggregatorOptions,
  getGroupedAggregatorMetadata,
} from "../../services/aggregator.service";
import { NotFoundError } from "../../errors";
import { searchRedditSubreddits } from "../../services/reddit.service";
import { searchYouTubeChannels } from "../../services/youtube.service";
import { getUserSettings } from "../../services/userSettings.service";
import { getAuthenticatedUser } from "../middleware";

/**
 * Aggregator router.
 */
export const aggregatorRouter = router({
  /**
   * List all available aggregators.
   * Filters YouTube and Reddit based on user settings if authenticated.
   */
  list: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    return await getAllAggregatorMetadata(userId);
  }),

  /**
   * List all available aggregators grouped by type.
   * Filters YouTube and Reddit based on user settings if authenticated.
   */
  grouped: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    const grouped = await getGroupedAggregatorMetadata(userId);
    // Add enabled property to match frontend Aggregator interface
    return {
      managed: grouped.managed.map((a) => ({
        ...a,
        enabled: true,
        defaultDailyLimit: a.defaultDailyLimit,
      })),
      social: grouped.social.map((a) => ({
        ...a,
        enabled: true,
        defaultDailyLimit: a.defaultDailyLimit,
      })),
      custom: grouped.custom.map((a) => ({
        ...a,
        enabled: true,
        defaultDailyLimit: a.defaultDailyLimit,
      })),
    };
  }),

  /**
   * Get aggregator detail including identifier config and options.
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => {
      try {
        const detail = getAggregatorDetail(input.id);
        // Convert identifier_type to match frontend expectations
        // 'text' or 'select' -> 'string', keep 'url' as is
        const identifierType =
          detail.identifier_type === "url" ? "url" : "string";
        return {
          id: detail.id,
          identifierType: identifierType as "url" | "string",
          identifierLabel: detail.identifier_label,
          identifierDescription: detail.identifier_description,
          identifierPlaceholder: detail.identifier_placeholder,
          identifierChoices: detail.identifier_choices || undefined,
          identifierEditable: detail.identifier_editable,
          options: detail.options,
          prefillName: detail.prefill_name,
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Get aggregator options schema.
   */
  getOptions: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => {
      try {
        const options = getAggregatorOptions(input.id);
        return options || {};
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Search Reddit subreddits.
   * Returns a list of subreddits matching the search query.
   */
  searchSubreddits: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(100).optional().default(25),
      }),
    )
    .query(async ({ input }) => {
      try {
        const subreddits = await searchRedditSubreddits(
          input.query,
          input.limit,
        );
        return subreddits;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to search subreddits: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Search YouTube channels.
   * Returns a list of channels matching the search query.
   * Requires authentication and YouTube API key in user settings.
   */
  searchChannels: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(50).optional().default(25),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        const user = getAuthenticatedUser(ctx);
        const settings = await getUserSettings(user.id);

        if (
          !settings.youtubeEnabled ||
          !settings.youtubeApiKey ||
          settings.youtubeApiKey.trim() === ""
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "YouTube API key is not configured. Please configure it in settings.",
          });
        }

        const channels = await searchYouTubeChannels(
          input.query,
          settings.youtubeApiKey,
          input.limit,
        );
        return channels;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to search YouTube channels: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});
