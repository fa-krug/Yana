/**
 * Base tRPC procedures with common middleware.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";
import {
  requireAuth,
  requireSuperuser,
  getAuthenticatedUser,
  getSuperuser,
} from "./middleware";

/**
 * Initialize tRPC with context and transformer.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Extract field errors from error object
    let fieldErrors: Record<string, string> | undefined;

    // Check if fieldErrors was attached to the error
    if (
      (error as any).fieldErrors &&
      typeof (error as any).fieldErrors === "object"
    ) {
      fieldErrors = (error as any).fieldErrors;
    }
    // Otherwise check the cause
    else if (
      error.cause &&
      typeof error.cause === "object" &&
      !(error.cause instanceof Error)
    ) {
      // Check if cause has field error properties (not just a generic error)
      const cause = error.cause as any;
      if (
        "clientId" in cause ||
        "clientSecret" in cause ||
        "apiKey" in cause ||
        "apiUrl" in cause ||
        "general" in cause
      ) {
        fieldErrors = cause;
      }
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
        httpStatus: getHTTPStatusCodeFromError(error),
        // Include field errors if they exist
        ...(fieldErrors && { fieldErrors }),
      },
    };
  },
});

/**
 * Get HTTP status code from tRPC error.
 */
function getHTTPStatusCodeFromError(error: TRPCError): number {
  switch (error.code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_SUPPORTED":
      return 405;
    case "TIMEOUT":
      return 408;
    case "CONFLICT":
      return 409;
    case "PRECONDITION_FAILED":
      return 412;
    case "PAYLOAD_TOO_LARGE":
      return 413;
    case "UNPROCESSABLE_CONTENT":
      return 422;
    case "TOO_MANY_REQUESTS":
      return 429;
    case "CLIENT_CLOSED_REQUEST":
      return 499;
    case "INTERNAL_SERVER_ERROR":
    default:
      return 500;
  }
}

/**
 * Base router and procedure builders.
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure that requires authentication.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  requireAuth(ctx);
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // TypeScript now knows user is non-null
    },
  });
});

/**
 * Superuser procedure that requires superuser access.
 */
export const superuserProcedure = t.procedure.use(({ ctx, next }) => {
  requireSuperuser(ctx);
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // TypeScript now knows user is superuser
    },
  });
});

/**
 * Export helpers for use in procedures.
 */
export { getAuthenticatedUser, getSuperuser };
