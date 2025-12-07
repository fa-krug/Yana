/**
 * Unit tests for user service.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setupTestDb,
  teardownTestDb,
  getTestDb,
} from "../../../tests/utils/testDb";
import {
  createUser,
  authenticateUser,
  getUserById,
  getUserByUsername,
} from "./user.service";
import { testUser } from "../../../tests/utils/fixtures";
import * as bcrypt from "bcrypt";
import { db, users } from "../db";
import { eq } from "drizzle-orm";

describe("UserService", () => {
  beforeEach(async () => {
    setupTestDb();
    // Clean up any existing test users
    await db.delete(users).where(eq(users.username, testUser.username));
  });

  afterEach(() => {
    teardownTestDb();
  });

  describe("createUser", () => {
    it("should create a new user", async () => {
      const user = await createUser(
        testUser.username,
        testUser.email,
        "password",
      );

      expect(user.username).toBe(testUser.username);
      expect(user.email).toBe(testUser.email);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe("password"); // Should be hashed
    });

    it("should throw error if username already exists", async () => {
      await createUser(testUser.username, testUser.email, "password");

      await expect(
        createUser(testUser.username, "other@example.com", "password"),
      ).rejects.toThrow();
    });

    it("should throw error if email already exists", async () => {
      await createUser(testUser.username, testUser.email, "password");

      await expect(
        createUser("otheruser", testUser.email, "password"),
      ).rejects.toThrow();
    });
  });

  describe("authenticateUser", () => {
    it("should authenticate user with correct password", async () => {
      await createUser(testUser.username, testUser.email, "password");

      const user = await authenticateUser(testUser.username, "password");

      expect(user).toBeDefined();
      expect(user.username).toBe(testUser.username);
    });

    it("should throw error with incorrect password", async () => {
      await createUser(testUser.username, testUser.email, "password");

      await expect(
        authenticateUser(testUser.username, "wrongpassword"),
      ).rejects.toThrow();
    });

    it("should throw error for non-existent user", async () => {
      await expect(
        authenticateUser("nonexistent", "password"),
      ).rejects.toThrow();
    });
  });

  describe("getUserById", () => {
    it("should get user by ID", async () => {
      const created = await createUser(
        testUser.username,
        testUser.email,
        "password",
      );
      const user = await getUserById(created.id);

      expect(user).toBeDefined();
      expect(user?.id).toBe(created.id);
      expect(user?.username).toBe(testUser.username);
    });

    it("should throw error for non-existent user", async () => {
      await expect(getUserById(999)).rejects.toThrow();
    });
  });

  describe("getUserByUsername", () => {
    it("should get user by username", async () => {
      await createUser(testUser.username, testUser.email, "password");
      const user = await getUserByUsername(testUser.username);

      expect(user).toBeDefined();
      expect(user?.username).toBe(testUser.username);
    });

    it("should return null for non-existent username", async () => {
      const user = await getUserByUsername("nonexistent");
      expect(user).toBeNull();
    });
  });
});
