/**
 * Authentication middleware.
 *
 * Provides session-based authentication middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import { AuthenticationError, PermissionDeniedError } from '../errors';

/**
 * Express session with user ID.
 */
export interface SessionWithUser extends SessionData {
  userId?: number;
  isSuperuser?: boolean;
}

/**
 * Express request with user information.
 */
export interface AuthenticatedRequest extends Request {
  session: Session & SessionWithUser;
  user?: {
    id: number;
    username: string;
    email: string;
    isSuperuser: boolean;
    isStaff: boolean;
  };
}

/**
 * Require authentication middleware.
 * Ensures user is logged in.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as Session & SessionWithUser;

  if (!session.userId) {
    return next(new AuthenticationError('Authentication required'));
  }

  next();
}

/**
 * Require superuser middleware.
 * Ensures user is a superuser.
 */
export function requireSuperuser(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as Session & SessionWithUser;

  if (!session.userId) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (!session.isSuperuser) {
    return next(new PermissionDeniedError('Superuser access required'));
  }

  next();
}

/**
 * Load user from session.
 * Populates req.user with user information.
 */
export async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const session = authReq.session;

  if (session.userId) {
    try {
      const { getUserById } = await import('../services/user.service');
      const user = await getUserById(session.userId);
      authReq.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        isSuperuser: user.isSuperuser,
        isStaff: user.isStaff,
      };
    } catch (error) {
      // User not found or error loading - clear session
      session.userId = undefined;
      session.isSuperuser = undefined;
    }
  }

  next();
}

/**
 * Optional authentication middleware.
 * Loads user if authenticated, but doesn't require it.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  await loadUser(req, res, next);
}
