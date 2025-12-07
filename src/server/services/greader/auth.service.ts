/**
 * Google Reader API authentication service.
 */

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, users, greaderAuthTokens } from '../../db';
import { authenticateUser } from '../user.service';
import { logger } from '../../utils/logger';

/**
 * Authenticate user with credentials and create token.
 */
export async function authenticateWithCredentials(
  email: string,
  password: string
): Promise<{ user: { id: number; username: string }; token: string } | null> {
  if (!email || !password) {
    return null;
  }

  try {
    const user = await authenticateUser(email, password);

    // Create auth token
    const token = generateToken(user.username, user.id);

    // Store token in database
    await db.insert(greaderAuthTokens).values({
      userId: user.id,
      token,
      expiresAt: null, // Long-lived token
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info({ username: user.username }, 'GReader API authentication successful');

    return {
      user: {
        id: user.id,
        username: user.username,
      },
      token,
    };
  } catch {
    logger.warn({ email }, 'GReader API authentication failed');
    return null;
  }
}

/**
 * Authenticate request using Authorization header or session.
 */
export async function authenticateRequest(
  authHeader: string | undefined,
  sessionUserId: number | undefined
): Promise<{ id: number; username: string } | null> {
  // Try Authorization header (GoogleLogin auth=token)
  if (authHeader?.startsWith('GoogleLogin auth=')) {
    const token = authHeader.slice(17);
    return await getUserByToken(token);
  }

  // Fallback to session authentication
  if (sessionUserId) {
    const [user] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1);
    if (user) {
      return {
        id: user.id,
        username: user.username,
      };
    }
  }

  return null;
}

/**
 * Generate session token (short-lived).
 */
export function generateSessionToken(userId: number): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${userId}:${Date.now()}`);
  return hash.digest('hex').slice(0, 57); // 57 characters as per Google Reader spec
}

/**
 * Generate auth token.
 */
function generateToken(username: string, userId: number): string {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256');
  hash.update(`${username}:${userId}:${randomBytes}`);
  return hash.digest('hex');
}

/**
 * Get user by token.
 */
async function getUserByToken(token: string): Promise<{ id: number; username: string } | null> {
  const [authToken] = await db
    .select({
      userId: greaderAuthTokens.userId,
      expiresAt: greaderAuthTokens.expiresAt,
    })
    .from(greaderAuthTokens)
    .where(eq(greaderAuthTokens.token, token))
    .limit(1);

  if (!authToken) {
    return null;
  }

  // Check if expired
  if (authToken.expiresAt && authToken.expiresAt < new Date()) {
    return null;
  }

  // Get user
  const [user] = await db.select().from(users).where(eq(users.id, authToken.userId)).limit(1);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
  };
}
