/**
 * User settings service.
 *
 * Handles user settings and API credentials.
 */

import { eq } from 'drizzle-orm';
import { db, userSettings } from '../db';
import { NotFoundError } from '../errors';
import { logger } from '../utils/logger';
import type { UserSettings, UserSettingsInsert } from '../db/types';

/**
 * Get user settings by user ID.
 */
export async function getUserSettings(userId: number): Promise<UserSettings> {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings) {
    // Create default settings if they don't exist
    return createDefaultUserSettings(userId);
  }

  return settings;
}

/**
 * Create default user settings.
 */
export async function createDefaultUserSettings(userId: number): Promise<UserSettings> {
  const now = new Date();

  const [settings] = await db
    .insert(userSettings)
    .values({
      userId,
      redditEnabled: false,
      redditClientId: '',
      redditClientSecret: '',
      redditUserAgent: 'Yana/1.0',
      youtubeEnabled: false,
      youtubeApiKey: '',
      openaiEnabled: false,
      openaiApiUrl: 'https://api.openai.com/v1',
      openaiApiKey: '',
      aiModel: 'gpt-4o-mini',
      aiTemperature: 0.3,
      aiMaxTokens: 2000,
      aiDefaultDailyLimit: 200,
      aiDefaultMonthlyLimit: 2000,
      aiMaxPromptLength: 500,
      aiRequestTimeout: 120,
      aiMaxRetries: 3,
      aiRetryDelay: 2,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info({ userId }, 'Default user settings created');

  return settings;
}

/**
 * Update user settings.
 */
export async function updateUserSettings(
  userId: number,
  updates: Partial<UserSettingsInsert>
): Promise<UserSettings> {
  const [updated] = await db
    .update(userSettings)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .returning();

  if (!updated) {
    // Create settings if they don't exist
    await createDefaultUserSettings(userId);
    return updateUserSettings(userId, updates);
  }

  logger.info({ userId }, 'User settings updated');

  return updated;
}
