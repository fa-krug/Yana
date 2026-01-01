/**
 * AI quota management service.
 *
 * Tracks AI usage per user with daily and monthly limits.
 */

import { eq } from "drizzle-orm";

import { db, userAIQuotas } from "../db";
import type { UserAIQuota } from "../db/types";
import { logger } from "../utils/logger";

import { AIQuotaExceededError } from "./ai.service.interface";

/**
 * Get user AI quota.
 */
export async function getUserAIQuota(userId: number): Promise<UserAIQuota> {
  const [quota] = await db
    .select()
    .from(userAIQuotas)
    .where(eq(userAIQuotas.userId, userId))
    .limit(1);

  if (!quota) {
    // Create default quota
    return createDefaultQuota(userId);
  }

  // Reset if needed
  await resetQuotaIfNeeded(quota);

  return quota;
}

/**
 * Create default quota for user.
 */
async function createDefaultQuota(userId: number): Promise<UserAIQuota> {
  // Get user settings for default limits
  const { getUserSettings } = await import("./userSettings.service");
  const settings = await getUserSettings(userId);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const nextMonth = new Date(now);
  nextMonth.setUTCDate(1);
  nextMonth.setUTCHours(0, 0, 0, 0);
  if (nextMonth.getUTCMonth() === 11) {
    nextMonth.setUTCFullYear(nextMonth.getUTCFullYear() + 1);
    nextMonth.setUTCMonth(0);
  } else {
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  }

  const [quota] = await db
    .insert(userAIQuotas)
    .values({
      userId,
      dailyLimit: settings.aiDefaultDailyLimit,
      monthlyLimit: settings.aiDefaultMonthlyLimit,
      dailyUsed: 0,
      monthlyUsed: 0,
      dailyResetAt: tomorrow,
      monthlyResetAt: nextMonth,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info({ userId }, "Default AI quota created");
  return quota;
}

/**
 * Reset quota counters if time period has passed.
 */
async function resetQuotaIfNeeded(quota: UserAIQuota): Promise<void> {
  const now = new Date();
  let needsUpdate = false;
  const updates: Partial<UserAIQuota> = {};

  // Reset daily counter
  if (now >= quota.dailyResetAt) {
    updates.dailyUsed = 0;
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    updates.dailyResetAt = tomorrow;
    needsUpdate = true;
  }

  // Reset monthly counter
  if (now >= quota.monthlyResetAt) {
    updates.monthlyUsed = 0;
    const nextMonth = new Date(now);
    nextMonth.setUTCDate(1);
    nextMonth.setUTCHours(0, 0, 0, 0);
    if (nextMonth.getUTCMonth() === 11) {
      nextMonth.setUTCFullYear(nextMonth.getUTCFullYear() + 1);
      nextMonth.setUTCMonth(0);
    } else {
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    }
    updates.monthlyResetAt = nextMonth;
    needsUpdate = true;
  }

  if (needsUpdate) {
    await db
      .update(userAIQuotas)
      .set({ ...updates, updatedAt: now })
      .where(eq(userAIQuotas.id, quota.id));
  }
}

/**
 * Check if user can use AI.
 */
export async function canUseAI(userId: number): Promise<boolean> {
  const quota = await getUserAIQuota(userId);
  return (
    quota.dailyUsed < quota.dailyLimit && quota.monthlyUsed < quota.monthlyLimit
  );
}

/**
 * Increment AI usage.
 */
export async function incrementAIUsage(userId: number): Promise<void> {
  const quota = await getUserAIQuota(userId);

  // Check quota
  if (quota.dailyUsed >= quota.dailyLimit) {
    throw new AIQuotaExceededError("Daily AI quota exceeded");
  }

  if (quota.monthlyUsed >= quota.monthlyLimit) {
    throw new AIQuotaExceededError("Monthly AI quota exceeded");
  }

  // Increment usage
  await db
    .update(userAIQuotas)
    .set({
      dailyUsed: quota.dailyUsed + 1,
      monthlyUsed: quota.monthlyUsed + 1,
      updatedAt: new Date(),
    })
    .where(eq(userAIQuotas.id, quota.id));

  logger.info(
    {
      userId,
      dailyUsed: quota.dailyUsed + 1,
      monthlyUsed: quota.monthlyUsed + 1,
    },
    "AI usage incremented",
  );
}
