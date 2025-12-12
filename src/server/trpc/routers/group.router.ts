/**
 * Group router.
 *
 * Handles feed group management endpoints.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../procedures";
import { getAuthenticatedUser } from "../procedures";
import {
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getFeedGroups,
} from "@server/services/group.service";
import {
  NotFoundError,
  PermissionDeniedError,
  ConflictError,
} from "@server/errors";

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
 * Convert group object to API format.
 */
const formatGroup = (group: {
  id: number;
  userId: number | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): {
  id: number;
  userId?: number;
  name: string;
  createdAt: string;
  updatedAt: string;
} => {
  return {
    ...group,
    userId: group.userId ?? undefined,
    createdAt: toISOString(group.createdAt),
    updatedAt: toISOString(group.updatedAt),
  };
};

/**
 * Group router.
 */
export const groupRouter = router({
  /**
   * List groups for the authenticated user.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = getAuthenticatedUser(ctx);
    const groups = await listGroups(user.id);
    return groups.map(formatGroup);
  }),

  /**
   * Get group by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const group = await getGroup(input.id, user.id);
        return formatGroup(group);
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
   * Create new group.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const group = await createGroup(user.id, input.name);
        return formatGroup(group);
      } catch (error) {
        if (error instanceof ConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Update group.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const group = await updateGroup(input.id, user.id, input.name);
        return formatGroup(group);
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
        if (error instanceof ConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Delete group.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        await deleteGroup(input.id, user.id);
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
   * Get groups for a feed.
   */
  getFeedGroups: protectedProcedure
    .input(z.object({ feedId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = getAuthenticatedUser(ctx);
      try {
        const groups = await getFeedGroups(input.feedId, user.id);
        return groups.map(formatGroup);
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
});
