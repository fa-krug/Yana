/**
 * Express integration for tRPC.
 *
 * Sets up tRPC HTTP handler for Express.
 */

import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./router";
import { createContext } from "./context";
import { logger } from "../utils/logger";

/**
 * Create tRPC Express middleware.
 */
export function createTRPCMiddleware() {
  return createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ path, error, type, ctx, input }) => {
      // Log all errors with full context
      const errorContext: Record<string, unknown> = {
        path,
        type,
        code: error.code,
        message: error.message,
        cause: error.cause,
        stack: error.stack,
      };

      if (input) {
        try {
          errorContext["input"] =
            typeof input === "object" ? JSON.stringify(input) : String(input);
        } catch {
          errorContext["input"] = "[Unable to serialize input]";
        }
      }

      if (ctx?.req?.session?.id) {
        errorContext["sessionId"] = ctx.req.session.id;
      }

      if (ctx?.user) {
        errorContext["userId"] = ctx.user.id;
      }

      if (error.code === "UNAUTHORIZED") {
        logger.warn(errorContext, "tRPC unauthorized error");
      } else if (error.code === "INTERNAL_SERVER_ERROR") {
        logger.error(errorContext, "tRPC internal server error");
      } else {
        logger.warn(errorContext, "tRPC error");
      }
    },
  });
}
