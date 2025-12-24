/**
 * Tests for authentication router.
 */

import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import type { Session } from "express-session";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { db, users } from "@server/db";
import { createContext } from "@server/trpc/context";
import { appRouter } from "@server/trpc/router";

import { setupTestDb, teardownTestDb } from "../../../../../tests/utils/testDb";

describe("Auth Router", () => {
  let testUser: {
    id: number;
    username: string;
    email: string;
    passwordHash: string;
  };

  beforeEach(async () => {
    setupTestDb();
    // Create test user (database is reset in setupTestDb)
    const passwordHash = await bcrypt.hash("testpassword", 10);
    try {
      const [user] = await db
        .insert(users)
        .values({
          username: "testuser",
          email: "test@example.com",
          passwordHash,
          isSuperuser: false,
          isStaff: false,
        })
        .returning();

      testUser = user;
    } catch (error: unknown) {
      // If user already exists, try to get it
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.username, "testuser"))
          .limit(1);
        if (existing.length > 0) {
          testUser = existing[0];
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  });

  afterEach(() => {
    teardownTestDb();
  });

  it("should login with valid credentials", async () => {
    const mockReq = {
      session: {
        id: "test-session-id",
        cookie: {},
        regenerate: () => {},
        destroy: () => {},
        reload: () => {},
        resetMaxAge: () => {},
        save: (callback?: (err?: Error) => void) => {
          if (callback) callback();
        },
        touch: () => {},
        userId: undefined,
        isSuperuser: undefined,
      } as unknown as Session,
    } as Request;

    const mockRes = {
      clearCookie: () => {},
    } as unknown as Response;

    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      username: "testuser",
      password: "testpassword",
    });

    expect(result.success).toBe(true);
    expect(result.user.username).toBe("testuser");
    expect(result.user.email).toBe("test@example.com");
    expect((mockReq.session as any).userId).toBe(testUser.id);
  });

  it("should fail login with invalid credentials", async () => {
    const mockReq = {
      session: {
        id: "test-session-id",
        cookie: {},
        regenerate: () => {},
        destroy: () => {},
        reload: () => {},
        resetMaxAge: () => {},
        save: () => {},
        touch: () => {},
      } as unknown as Session,
    } as Request;

    const mockRes = {} as Response;

    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "testuser",
        password: "wrongpassword",
      }),
    ).rejects.toThrow();
  });

  it("should return auth status when authenticated", async () => {
    const mockReq = {
      session: {
        id: "test-session-id",
        cookie: {},
        regenerate: () => {},
        destroy: () => {},
        reload: () => {},
        resetMaxAge: () => {},
        save: () => {},
        touch: () => {},
        userId: testUser.id,
        isSuperuser: false,
      } as unknown as Session,
    } as Request;

    const mockRes = {} as Response;

    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.status();

    expect(result.authenticated).toBe(true);
    expect(result.user).not.toBeNull();
    expect(result.user?.username).toBe("testuser");
  });

  it("should return unauthenticated status when not logged in", async () => {
    const mockReq = {
      session: {
        id: "test-session-id",
        cookie: {},
        regenerate: () => {},
        destroy: () => {},
        reload: () => {},
        resetMaxAge: () => {},
        save: () => {},
        touch: () => {},
        // Explicitly no userId to ensure unauthenticated state
        userId: undefined,
        isSuperuser: undefined,
      } as unknown as Session,
    } as Request;

    const mockRes = {} as Response;

    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.status();

    expect(result.authenticated).toBe(false);
    expect(result.user).toBeNull();
  });

  it("should logout authenticated user", async () => {
    let sessionDestroyed = false;

    const mockReq = {
      session: {
        id: "test-session-id",
        cookie: {},
        regenerate: () => {},
        destroy: (callback?: (err?: Error) => void) => {
          sessionDestroyed = true;
          if (callback) callback();
        },
        reload: () => {},
        resetMaxAge: () => {},
        save: () => {},
        touch: () => {},
        userId: testUser.id,
        isSuperuser: false,
      } as unknown as Session,
    } as Request;

    const mockRes = {
      clearCookie: () => {},
    } as unknown as Response;

    const ctx = await createContext({ req: mockReq, res: mockRes });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result.message).toBe("Logged out successfully");
    expect(sessionDestroyed).toBe(true);
  });
});
