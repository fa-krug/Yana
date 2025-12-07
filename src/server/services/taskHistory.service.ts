/**
 * Task history service.
 *
 * Manages execution history for scheduled tasks.
 */

import { eq, and, gte, desc, lte } from 'drizzle-orm';
import { db, taskExecutions } from '../db';
import { logger } from '../utils/logger';
import type { TaskExecution, TaskExecutionInsert } from '../db/types';
import { subDays } from 'date-fns';

/**
 * Record a task execution.
 */
export async function recordExecution(
  taskId: string,
  status: 'success' | 'failed',
  error?: string,
  duration?: number
): Promise<void> {
  await db.insert(taskExecutions).values({
    taskId,
    executedAt: new Date(),
    status,
    error: error || null,
    duration: duration || null,
    createdAt: new Date(),
  });

  logger.debug({ taskId, status }, 'Task execution recorded');
}

/**
 * Get execution history for a task.
 */
export async function getExecutionHistory(
  taskId: string,
  days: number = 14
): Promise<TaskExecution[]> {
  const cutoffDate = subDays(new Date(), days);

  return await db
    .select()
    .from(taskExecutions)
    .where(and(eq(taskExecutions.taskId, taskId), gte(taskExecutions.executedAt, cutoffDate)))
    .orderBy(desc(taskExecutions.executedAt))
    .limit(100);
}

/**
 * Clean up old execution records.
 */
export async function cleanupOldExecutions(days: number = 14): Promise<number> {
  const cutoffDate = subDays(new Date(), days);

  // Get count before deletion
  const countResult = await db
    .select()
    .from(taskExecutions)
    .where(lte(taskExecutions.executedAt, cutoffDate));

  const countBefore = countResult.length;

  if (countBefore === 0) {
    return 0;
  }

  await db.delete(taskExecutions).where(lte(taskExecutions.executedAt, cutoffDate));

  logger.info({ days, deletedCount: countBefore }, 'Old task executions cleaned up');

  return countBefore;
}
