/**
 * tRPC client setup for Angular.
 *
 * Creates and configures the tRPC client with HTTP link and session support.
 */

import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
// Import AppRouter type from server
// Note: This import works because both src/app and src/server are in the same src directory
import type { AppRouter } from "../../../server/trpc/router";

/**
 * Check if we're running in a Node.js environment (SSR).
 */
function isServerSide(): boolean {
  return typeof window === "undefined";
}

/**
 * Get the base URL for tRPC requests.
 * In SSR, we need an absolute URL, so we construct it from environment or use localhost:3000.
 */
function getBaseUrl(): string {
  if (isServerSide()) {
    // In SSR, we need an absolute URL
    const port = process.env["PORT"] || "3000";
    const host = process.env["HOST"] || "localhost";
    const protocol =
      process.env["NODE_ENV"] === "production" ? "https" : "http";
    return `${protocol}://${host}:${port}`;
  }
  // In browser, relative URLs work fine
  return "";
}

/**
 * Create tRPC client with HTTP link.
 * Uses cookies for session-based authentication.
 */
export function createTRPCClient() {
  const baseUrl = getBaseUrl();
  const url = baseUrl ? `${baseUrl}/trpc` : "/trpc";

  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        transformer: superjson,
        // Include credentials (cookies) for session-based auth
        fetch: (url, options) => {
          // Ensure URL is absolute in SSR
          const absoluteUrl =
            typeof url === "string" && url.startsWith("/") && isServerSide()
              ? `${baseUrl}${url}`
              : url;

          return fetch(absoluteUrl, {
            ...options,
            credentials: "include", // Important for session cookies
          });
        },
      }),
    ],
  });
}

/**
 * Export AppRouter type for use in services.
 */
export type { AppRouter };
