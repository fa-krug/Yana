/**
 * Aggregator router.
 *
 * Provides aggregator metadata and options.
 * All endpoints are public (no authentication required).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../procedures';
import {
  getAllAggregatorMetadata,
  getAggregatorDetail,
  getAggregatorOptions,
  getGroupedAggregatorMetadata,
} from '../../services/aggregator.service';
import { NotFoundError } from '../../errors';

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
      managed: grouped.managed.map(a => ({ ...a, enabled: true })),
      social: grouped.social.map(a => ({ ...a, enabled: true })),
      custom: grouped.custom.map(a => ({ ...a, enabled: true })),
    };
  }),

  /**
   * Get aggregator detail including identifier config and options.
   */
  getById: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    try {
      const detail = getAggregatorDetail(input.id);
      // Convert identifier_type to match frontend expectations
      // 'text' or 'select' -> 'string', keep 'url' as is
      const identifierType = detail.identifier_type === 'url' ? 'url' : 'string';
      return {
        id: detail.id,
        identifierType: identifierType as 'url' | 'string',
        identifierLabel: detail.identifier_label,
        identifierDescription: detail.identifier_description,
        identifierPlaceholder: detail.identifier_placeholder,
        identifierChoices: detail.identifier_choices || undefined,
        identifierEditable: detail.identifier_editable,
        options: detail.options,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error.message,
        });
      }
      throw error;
    }
  }),

  /**
   * Get aggregator options schema.
   */
  getOptions: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    try {
      const options = getAggregatorOptions(input.id);
      return options || {};
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error.message,
        });
      }
      throw error;
    }
  }),
});
