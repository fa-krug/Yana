/**
 * Authentication router.
 *
 * Handles login, logout, and authentication status.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../procedures';
import { authenticateUser } from '../../services/user.service';
import { logger } from '../../utils/logger';
import { loginSchema } from '../../validation/schemas';

/**
 * Login input schema.
 */
const loginInputSchema = loginSchema;

/**
 * Login response schema.
 */
const loginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  user: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string(),
    is_superuser: z.boolean(),
    is_staff: z.boolean(),
  }),
});

/**
 * Auth status response schema.
 */
const authStatusResponseSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.number(),
      username: z.string(),
      email: z.string(),
      is_superuser: z.boolean(),
      is_staff: z.boolean(),
    })
    .nullable(),
});

/**
 * Authentication router.
 */
export const authRouter = router({
  /**
   * Login procedure.
   * Authenticates user and sets session.
   */
  login: publicProcedure
    .input(loginInputSchema)
    .output(loginResponseSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { username, password } = input;

        logger.info({ username, sessionId: ctx.req.session.id }, 'Login attempt started');

        const user = await authenticateUser(username, password);
        logger.info({ userId: user.id, username: user.username }, 'User authenticated');

        // Set session
        const session = ctx.req.session;
        logger.debug({ sessionId: session.id }, 'Setting session properties');

        session.userId = user.id;
        session.isSuperuser = user.isSuperuser;

        logger.debug(
          { sessionId: session.id, userId: user.id },
          'Session properties set, saving...'
        );

        // Explicitly save the session and handle errors
        await new Promise<void>((resolve, reject) => {
          session.save(err => {
            if (err) {
              // Log detailed error information
              const errorDetails = {
                message: err?.message || 'Unknown error',
                name: err?.name || 'Error',
                stack: err?.stack,
                sessionId: session.id,
                userId: user.id,
                username: user.username,
                errorType: err?.constructor?.name,
                errorString: String(err),
              };
              logger.error(errorDetails, 'Failed to save session during login');

              // Create a proper Error object if needed
              const errorToReject = err instanceof Error ? err : new Error(String(err));
              reject(errorToReject);
            } else {
              logger.debug(
                { sessionId: session.id, userId: user.id },
                'Session saved successfully'
              );
              resolve();
            }
          });
        });

        logger.info({ userId: user.id, username: user.username }, 'Login successful');
        return {
          success: true,
          message: 'Login successful',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            is_superuser: user.isSuperuser,
            is_staff: user.isStaff,
          },
        };
      } catch (error) {
        // Log the error with full details before rethrowing
        const err = error as Error;
        const errorContext = {
          error: err.message,
          name: err.name,
          stack: err.stack,
          errorString: String(err),
          errorType: err.constructor?.name,
          sessionId: ctx.req.session.id,
        };

        // Convert service errors to tRPC errors
        if (err.name === 'AuthenticationError') {
          logger.warn(errorContext, 'Login failed: authentication error');
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: err.message || 'Invalid username or password',
          });
        }

        logger.error(errorContext, 'Login failed: unexpected error');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Login failed',
        });
      }
    }),

  /**
   * Logout procedure.
   * Destroys the session.
   */
  logout: protectedProcedure.output(z.object({ message: z.string() })).mutation(async ({ ctx }) => {
    return new Promise((resolve, reject) => {
      ctx.req.session.destroy(err => {
        if (err) {
          logger.error({ error: err }, 'Failed to destroy session during logout');
          reject(
            new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to logout',
            })
          );
          return;
        }

        ctx.res.clearCookie('yana.sid');
        resolve({ message: 'Logged out successfully' });
      });
    });
  }),

  /**
   * Get authentication status.
   * Returns current user if authenticated, null otherwise.
   */
  status: publicProcedure.output(authStatusResponseSchema).query(async ({ ctx }) => {
    if (ctx.user) {
      return {
        authenticated: true,
        user: {
          id: ctx.user.id,
          username: ctx.user.username,
          email: ctx.user.email,
          is_superuser: ctx.user.isSuperuser,
          is_staff: ctx.user.isStaff,
        },
      };
    } else {
      return {
        authenticated: false,
        user: null,
      };
    }
  }),
});
