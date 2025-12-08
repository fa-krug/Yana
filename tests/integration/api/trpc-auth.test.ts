/**
 * Integration tests for tRPC authentication procedures.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { setupTestDb, teardownTestDb } from "../../utils/testDb";
import { createUser } from "../../../src/server/services/user.service";
import { createTRPCMiddleware } from "../../../src/server/trpc/express";
import cookieParser from "cookie-parser";
import session from "express-session";
import {
  errorHandler,
  notFoundHandler,
} from "../../../src/server/middleware/errorHandler";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../src/server/trpc/router";

describe("tRPC Auth Integration", () => {
  let app: express.Application;
  let trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>;
  let cookies: string[] = [];

  beforeEach(async () => {
    setupTestDb();
    cookies = []; // Reset cookies for each test

    app = express();

    // Force supertest to bind on loopback only to avoid sandbox EPERM on 0.0.0.0
    const originalListen = app.listen.bind(app) as any;
    app.listen = ((...args: any[]) => originalListen(0, "127.0.0.1")) as any;

    // Setup middleware
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      }),
    );

    // Setup tRPC routes
    app.use("/trpc", createTRPCMiddleware());

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Create tRPC client that uses supertest for HTTP requests
    // Maintains cookies between requests for session support
    trpcClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpLink({
          url: "/trpc",
          transformer: superjson,
          fetch: async (url, options) => {
            const method = options?.method || "GET";
            const body = options?.body
              ? JSON.parse(options.body as string)
              : undefined;

            let req = request(app)[method.toLowerCase()](url);

            // Include cookies from previous requests
            if (cookies.length > 0) {
              const cookieHeader = Array.isArray(cookies)
                ? cookies.join("; ")
                : cookies[0];
              req = req.set("Cookie", cookieHeader);
            }

            if (body) {
              req = req.send(body);
            }

            const response = await req;

            // Store cookies from response for next request
            const setCookie = response.headers["set-cookie"];
            if (setCookie) {
              if (Array.isArray(setCookie)) {
                cookies = setCookie;
              } else {
                cookies = [setCookie];
              }
            }

            return {
              json: async () => response.body,
              text: async () => JSON.stringify(response.body),
              headers: new Headers(response.headers as any),
              status: response.status,
            } as Response;
          },
        }),
      ],
    });
  });

  afterEach(() => {
    teardownTestDb();
  });

  describe("auth.login", () => {
    it("should login with valid credentials", async () => {
      // Create test user (database is reset in beforeEach)
      await createUser("testuser", "test@example.com", "password123");

      const result = await trpcClient.auth.login.mutate({
        username: "testuser",
        password: "password123",
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe("testuser");
    });

    it("should reject invalid credentials", async () => {
      // Create test user (database is reset in beforeEach)
      await createUser("testuser", "test@example.com", "password123");

      await expect(
        trpcClient.auth.login.mutate({
          username: "testuser",
          password: "wrongpassword",
        }),
      ).rejects.toThrow();
    });
  });

  describe("auth.status", () => {
    it("should return unauthenticated status when not logged in", async () => {
      const result = await trpcClient.auth.status.query();

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });
  });

  describe("auth.logout", () => {
    it("should logout successfully", async () => {
      // Create and login user first (database is reset in beforeEach)
      await createUser("testuser", "test@example.com", "password123");

      // Login first to establish session
      await trpcClient.auth.login.mutate({
        username: "testuser",
        password: "password123",
      });

      // Now logout - ensure cookies are maintained
      const result = await trpcClient.auth.logout.mutate();

      expect(result.message).toBe("Logged out successfully");
    });
  });
});
