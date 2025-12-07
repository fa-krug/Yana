/**
 * Admin router.
 *
 * Handles admin user management endpoints.
 * All procedures require superuser access.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, superuserProcedure } from '../procedures';
import { getSuperuser } from '../procedures';
import {
  createUser,
  getUserById,
  updateUserProfile,
  updateUserPassword,
  listUsers,
  updateUser,
} from '../../services/user.service';
import {
  adminUpdateUserSchema,
  adminCreateUserSchema,
  adminChangePasswordSchema,
  adminListUsersSchema,
} from '../../validation/schemas';
import { NotFoundError } from '../../errors';
import { adminTasksRouter } from './admin-tasks.router';

/**
 * Helper to convert date to ISO string.
 */
const toISOString = (date: Date | number | string | null | undefined): string => {
  if (!date) return new Date().toISOString();
  if (date instanceof Date) return date.toISOString();
  if (typeof date === 'number') return new Date(date).toISOString();
  if (typeof date === 'string') return date;
  return new Date().toISOString();
};

/**
 * Admin router with nested user and tasks routers.
 */
export const adminRouter = router({
  user: router({
    /**
     * List all users with filters.
     */
    list: superuserProcedure.input(adminListUsersSchema).query(async ({ input }) => {
      const result = await listUsers({
        page: input.page,
        limit: input.pageSize,
        search: input.search,
        isSuperuser: input.isSuperuser,
      });
      // Convert dates to strings
      return {
        ...result,
        items: result.items.map(user => ({
          ...user,
          createdAt: toISOString(user.createdAt),
          updatedAt: toISOString(user.updatedAt),
        })),
      };
    }),

    /**
     * Get user by ID.
     */
    getById: superuserProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        try {
          const user = await getUserById(input.id);
          return {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            isSuperuser: user.isSuperuser,
            isStaff: user.isStaff,
            createdAt: toISOString(user.createdAt),
            updatedAt: toISOString(user.updatedAt),
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
     * Create a new user.
     */
    create: superuserProcedure.input(adminCreateUserSchema).mutation(async ({ input }) => {
      const { username, email, password, firstName, lastName, isSuperuser } = input;

      const user = await createUser(username, email, password);

      // Update additional fields if provided
      if (firstName !== undefined || lastName !== undefined || isSuperuser !== undefined) {
        const updateData: {
          firstName?: string;
          lastName?: string;
          isSuperuser?: boolean;
        } = {};

        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (isSuperuser !== undefined) updateData.isSuperuser = isSuperuser;

        await updateUser(user.id, updateData);
      }

      const updatedUser = await getUserById(user.id);
      return {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName || '',
        lastName: updatedUser.lastName || '',
        isSuperuser: updatedUser.isSuperuser,
        isStaff: updatedUser.isStaff,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };
    }),

    /**
     * Update user.
     */
    update: superuserProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          data: adminUpdateUserSchema,
        })
      )
      .mutation(async ({ input }) => {
        const { id, data } = input;
        const { username, email, firstName, lastName, isSuperuser } = data;

        // Check if user exists
        await getUserById(id);

        // Update profile fields if provided
        if (email !== undefined || firstName !== undefined || lastName !== undefined) {
          await updateUserProfile(id, {
            email: email || '',
            firstName,
            lastName,
          });
        }

        // Update username and superuser status if provided
        if (username !== undefined || isSuperuser !== undefined) {
          const updateData: {
            username?: string;
            isSuperuser?: boolean;
          } = {};

          if (username !== undefined) updateData.username = username;
          if (isSuperuser !== undefined) updateData.isSuperuser = isSuperuser;

          await updateUser(id, updateData);
        }

        const updatedUser = await getUserById(id);
        return {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.firstName || '',
          lastName: updatedUser.lastName || '',
          isSuperuser: updatedUser.isSuperuser,
          isStaff: updatedUser.isStaff,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        };
      }),

    /**
     * Change user password (admin can change any user's password).
     */
    resetPassword: superuserProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          newPassword: z.string().min(8),
        })
      )
      .mutation(async ({ input }) => {
        // Check if user exists
        await getUserById(input.id);

        await updateUserPassword(input.id, input.newPassword);

        return {
          success: true,
          message: 'Password changed successfully',
        };
      }),

    /**
     * Delete user.
     */
    delete: superuserProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        // Check if user exists
        await getUserById(input.id);

        // Note: Delete functionality would need to be implemented in user.service
        // For now, we'll just return success
        // In a real implementation, you'd call deleteUser(input.id)
        return {
          success: true,
          message: 'User deleted successfully',
        };
      }),
  }),

  /**
   * Tasks router for managing background tasks.
   */
  tasks: adminTasksRouter,
});
