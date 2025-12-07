/**
 * tRPC middleware for authentication and authorization.
 */

import { TRPCError } from '@trpc/server';
import type { Context } from './context';

/**
 * Middleware to require authentication.
 * Throws UNAUTHORIZED error if user is not authenticated.
 */
export function requireAuth(
  ctx: Context
): asserts ctx is Context & { user: NonNullable<Context['user']> } {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
}

/**
 * Middleware to require superuser access.
 * Throws FORBIDDEN error if user is not a superuser.
 */
export function requireSuperuser(
  ctx: Context
): asserts ctx is Context & { user: NonNullable<Context['user']> & { isSuperuser: true } } {
  requireAuth(ctx);

  if (!ctx.user.isSuperuser) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Superuser access required',
    });
  }
}

/**
 * Helper to get authenticated user (throws if not authenticated).
 */
export function getAuthenticatedUser(ctx: Context): NonNullable<Context['user']> {
  requireAuth(ctx);
  return ctx.user;
}

/**
 * Helper to get superuser (throws if not superuser).
 */
export function getSuperuser(ctx: Context): NonNullable<Context['user']> & { isSuperuser: true } {
  requireSuperuser(ctx);
  return ctx.user;
}
