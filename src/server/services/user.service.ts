/**
 * User service.
 *
 * Handles user management and authentication.
 */

import bcrypt from "bcrypt";
import { eq, and, or, like, desc } from "drizzle-orm";

import { db, users } from "../db";
import type { User } from "../db/types";
import { NotFoundError, AuthenticationError, ConflictError } from "../errors";
import { formatPaginatedResponse } from "../middleware/pagination";
import { logger } from "../utils/logger";

const SALT_ROUNDS = 10;

/**
 * Create a new user.
 */
export async function createUser(
  username: string,
  email: string,
  password: string,
): Promise<User> {
  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError("Username already exists");
  }

  // Check if email already exists
  const existingEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingEmail.length > 0) {
    throw new ConflictError("Email already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user
  const [newUser] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
      isSuperuser: false,
      isStaff: false,
    })
    .returning();

  logger.info({ userId: newUser.id, username }, "User created");

  return newUser;
}

/**
 * Authenticate user (login).
 */
export async function authenticateUser(
  username: string,
  password: string,
): Promise<User> {
  logger.debug({ username }, "Authenticating user");

  // Find user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    logger.warn({ username }, "Authentication failed: user not found");
    throw new AuthenticationError("Invalid username or password");
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    logger.warn(
      { userId: user.id, username },
      "Authentication failed: invalid password",
    );
    throw new AuthenticationError("Invalid username or password");
  }

  logger.info({ userId: user.id, username }, "User authenticated successfully");

  return user;
}

/**
 * Get user by ID.
 */
export async function getUserById(id: number): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!user) {
    throw new NotFoundError(`User with id ${id} not found`);
  }

  return user;
}

/**
 * Get user by username.
 */
export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  return user || null;
}

/**
 * Update user password.
 */
export async function updateUserPassword(
  userId: number,
  newPassword: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  logger.info({ userId }, "User password updated");
}

/**
 * Update user profile.
 */
export async function updateUserProfile(
  userId: number,
  data: { email: string; firstName?: string; lastName?: string },
): Promise<User> {
  // Check if email is already taken by another user
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);

  if (existing.length > 0 && existing[0].id !== userId) {
    throw new ConflictError("Email already exists");
  }

  const updateData: {
    email: string;
    firstName?: string;
    lastName?: string;
    updatedAt: Date;
  } = {
    email: data.email,
    updatedAt: new Date(),
  };

  if (data.firstName !== undefined) {
    updateData.firstName = data.firstName;
  }

  if (data.lastName !== undefined) {
    updateData.lastName = data.lastName;
  }

  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();

  logger.info({ userId, email: data.email }, "User profile updated");

  return updatedUser;
}

/**
 * List users with pagination and filters.
 */
export async function listUsers(options: {
  page: number;
  limit: number;
  search?: string;
  isSuperuser?: boolean;
}) {
  const { page, limit, search, isSuperuser } = options;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    const searchCondition = or(
      like(users.username, `%${search}%`),
      like(users.email, `%${search}%`),
      like(users.firstName, `%${search}%`),
      like(users.lastName, `%${search}%`),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (isSuperuser !== undefined) {
    conditions.push(eq(users.isSuperuser, isSuperuser));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const totalResult = await db
    .select({ count: users.id })
    .from(users)
    .where(whereClause);
  const total = totalResult.length;

  // Get paginated users
  const userList = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isSuperuser: users.isSuperuser,
      isStaff: users.isStaff,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return formatPaginatedResponse(userList, total, {
    page,
    pageSize: limit,
  });
}

/**
 * Update user (admin function - can update username and superuser status).
 */
export async function updateUser(
  userId: number,
  data: {
    username?: string;
    isSuperuser?: boolean;
  },
): Promise<User> {
  // Check if username is already taken by another user
  if (data.username !== undefined) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== userId) {
      throw new ConflictError("Username already exists");
    }
  }

  const updateData: {
    username?: string;
    isSuperuser?: boolean;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (data.username !== undefined) {
    updateData.username = data.username;
  }

  if (data.isSuperuser !== undefined) {
    updateData.isSuperuser = data.isSuperuser;
  }

  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();

  logger.info(
    { userId, username: data.username, isSuperuser: data.isSuperuser },
    "User updated",
  );

  return updatedUser;
}

/**
 * Delete user.
 */
export async function deleteUser(userId: number): Promise<void> {
  // Check if user exists
  await getUserById(userId);

  await db.delete(users).where(eq(users.id, userId));

  logger.info({ userId }, "User deleted");
}
