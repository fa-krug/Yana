/**
 * tRPC context creation.
 *
 * Creates the context for tRPC procedures with session support.
 */

import type { inferAsyncReturnType } from "@trpc/server";
import type { Request, Response } from "express";
import type { Session } from "express-session";
import { getUserById } from "../services/user.service";
import { logger } from "../utils/logger";

/**
 * Session data with user information.
 */
export interface SessionWithUser extends Session {
  userId?: number;
  isSuperuser?: boolean;
}

/**
 * Express request with session.
 */
export interface RequestWithSession extends Request {
  session: SessionWithUser;
}

/**
 * User information from context.
 */
export interface ContextUser {
  id: number;
  username: string;
  email: string;
  isSuperuser: boolean;
  isStaff: boolean;
}

/**
 * tRPC context.
 */
export interface Context {
  req: RequestWithSession;
  res: Response;
  user: ContextUser | null;
}

/**
 * Create tRPC context from Express request/response.
 */
export async function createContext(opts: {
  req: Request;
  res: Response;
}): Promise<Context> {
  const { req, res } = opts;
  const session = req.session as SessionWithUser;

  let user: ContextUser | null = null;

  // Load user from session if authenticated
  if (session.userId) {
    try {
      const dbUser = await getUserById(session.userId);
      user = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        isSuperuser: dbUser.isSuperuser,
        isStaff: dbUser.isStaff,
      };
    } catch (error) {
      // User not found or error loading - clear session
      logger.warn(
        { userId: session.userId, error },
        "Failed to load user from session",
      );
      session.userId = undefined;
      session.isSuperuser = undefined;
    }
  }

  return {
    req: req as RequestWithSession,
    res,
    user,
  };
}

/**
 * Infer context type for use in procedures.
 */
export type ContextType = inferAsyncReturnType<typeof createContext>;
