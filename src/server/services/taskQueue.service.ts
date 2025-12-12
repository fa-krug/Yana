/**
 * Task queue service.
 *
 * Manages DB-based task queue for background processing.
 */

import { eq, and, asc, desc, inArray, gte, lte, sql } from "drizzle-orm";
import { db, tasks } from "../db";
import { logger } from "../utils/logger";
import type { Task, TaskInsert } from "../db/types";
import { getEventEmitter } from "./eventEmitter.service";

export type TaskStatus = "pending" | "running" | "completed" | "failed";
export type TaskType =
  | "aggregate_feed"
  | "aggregate_article"
  | "fetch_icon"
  | string;

export type TaskFilters = {
  status?: TaskStatus[];
  type?: string[];
  dateFrom?: Date;
  dateTo?: Date;
};

export type Pagination = {
  page: number;
  limit: number;
};

export type PaginatedTasks = {
  items: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type TaskDetails = Task;

/**
 * Check if workers are disabled (for debugging).
 * When DISABLE_WORKERS=true, tasks run synchronously in the main process.
 */
function areWorkersDisabled(): boolean {
  return process.env["DISABLE_WORKERS"] === "true";
}

/**
 * Process a task synchronously in the main process (for debugging).
 * This allows breakpoints to work since code runs in the main process.
 */
async function processTaskSynchronously(
  task: Task,
): Promise<{ result?: Record<string, unknown>; error?: string }> {
  logger.info(
    { taskId: task.id, taskType: task.type },
    "Processing task synchronously (workers disabled)",
  );

  try {
    let result: unknown;

    const payload =
      typeof task.payload === "string"
        ? JSON.parse(task.payload)
        : task.payload;

    switch (task.type) {
      case "aggregate_feed": {
        const { processFeedAggregation } =
          await import("./aggregation.service");
        const { feedId, forceRefresh } = payload as {
          feedId: number;
          forceRefresh: boolean;
        };
        result = await processFeedAggregation(feedId, forceRefresh);
        break;
      }

      case "aggregate_article": {
        const { processArticleReload } = await import("./aggregation.service");
        const { articleId } = payload as { articleId: number };
        await processArticleReload(articleId);
        result = { success: true };
        break;
      }

      case "fetch_icon": {
        const { processIconFetch } = await import("./icon.service");
        const { feedId, force } = payload as {
          feedId: number;
          force?: boolean;
        };
        await processIconFetch(feedId, force || false);
        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    return { result: result as Record<string, unknown> };
  } catch (error) {
    logger.error({ error, taskId: task.id }, "Task processing failed");
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Enqueue a new task.
 * If DISABLE_WORKERS=true, processes the task synchronously in the main process.
 */
export async function enqueueTask(
  type: TaskType,
  payload: Record<string, unknown>,
  maxRetries: number = 3,
): Promise<Task> {
  const [task] = await db
    .insert(tasks)
    .values({
      type,
      status: "pending",
      payload: JSON.stringify(payload),
      retries: 0,
      maxRetries,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logger.info({ taskId: task.id, type }, "Task enqueued");

  // Emit event for real-time updates
  getEventEmitter().emit("task-created", {
    taskId: task.id,
    type,
    status: task.status,
  });

  // If workers are disabled, process synchronously
  if (areWorkersDisabled()) {
    // Mark as running
    await db
      .update(tasks)
      .set({
        status: "running",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    getEventEmitter().emit("task-updated", {
      taskId: task.id,
      status: "running",
    });

    // Process synchronously
    const { result, error } = await processTaskSynchronously(task);

    // Update task status
    if (error) {
      await updateTaskStatus(task.id, "failed", undefined, error);
    } else {
      await updateTaskStatus(task.id, "completed", result);
    }
  }

  return task;
}

/**
 * Get next pending task.
 */
export async function getNextTask(): Promise<Task | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.status, "pending"))
    .orderBy(asc(tasks.createdAt))
    .limit(1);

  if (!task) return null;

  // Mark as running
  await db
    .update(tasks)
    .set({
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  // Emit event for real-time updates
  getEventEmitter().emit("task-updated", {
    taskId: task.id,
    status: "running",
  });

  return task;
}

/**
 * Update task status.
 */
export async function updateTaskStatus(
  id: number,
  status: TaskStatus,
  result?: Record<string, unknown>,
  error?: string,
): Promise<void> {
  const updateData: Partial<TaskInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (result !== undefined) {
    updateData.result = JSON.stringify(result);
  }

  if (error !== undefined) {
    updateData.error = error;
  }

  if (status === "completed" || status === "failed") {
    updateData.completedAt = new Date();
  }

  await db.update(tasks).set(updateData).where(eq(tasks.id, id));

  logger.info({ taskId: id, status }, "Task status updated");

  // Emit event for real-time updates
  getEventEmitter().emit("task-updated", {
    taskId: id,
    status,
    result,
    error,
  });
}

/**
 * Retry a failed task.
 */
export async function retryTask(id: number): Promise<Task | null> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

  if (!task) return null;

  if (task.retries >= task.maxRetries) {
    logger.warn(
      { taskId: id, retries: task.retries },
      "Task exceeded max retries",
    );
    return null;
  }

  const [updated] = await db
    .update(tasks)
    .set({
      status: "pending",
      retries: task.retries + 1,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id))
    .returning();

  logger.info({ taskId: id, retries: updated.retries }, "Task retried");

  // Emit event for real-time updates
  if (updated) {
    getEventEmitter().emit("task-updated", {
      taskId: id,
      status: "pending",
      retries: updated.retries,
    });
  }

  return updated || null;
}

/**
 * Get task by ID.
 */
export async function getTask(id: number): Promise<Task | null> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return task || null;
}

/**
 * Get tasks by status.
 */
export async function getTasksByStatus(
  status: TaskStatus,
  limit: number = 100,
): Promise<Task[]> {
  return await db
    .select()
    .from(tasks)
    .where(eq(tasks.status, status))
    .orderBy(asc(tasks.createdAt))
    .limit(limit);
}

/**
 * List tasks with filters and pagination.
 */
export async function listTasks(
  filters: TaskFilters = {},
  pagination: Pagination = { page: 1, limit: 20 },
): Promise<PaginatedTasks> {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [];

  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(tasks.status, filters.status));
  }

  if (filters.type && filters.type.length > 0) {
    conditions.push(inArray(tasks.type, filters.type));
  }

  if (filters.dateFrom) {
    conditions.push(gte(tasks.createdAt, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(tasks.createdAt, filters.dateTo));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(whereClause);

  const total = totalResult[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  // Get paginated tasks
  const items = await db
    .select()
    .from(tasks)
    .where(whereClause)
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Get task details by ID.
 */
export async function getTaskDetails(id: number): Promise<TaskDetails | null> {
  return await getTask(id);
}

/**
 * Cancel a running or pending task.
 */
export async function cancelTask(id: number): Promise<void> {
  const task = await getTask(id);
  if (!task) {
    throw new Error(`Task ${id} not found`);
  }

  if (task.status !== "pending" && task.status !== "running") {
    throw new Error(`Cannot cancel task with status ${task.status}`);
  }

  await db
    .update(tasks)
    .set({
      status: "failed",
      error: "Cancelled by admin",
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(tasks.id, id));

  logger.info({ taskId: id }, "Task cancelled");

  // Emit event for real-time updates
  getEventEmitter().emit("task-updated", {
    taskId: id,
    status: "failed",
    error: "Cancelled by admin",
  });
}

/**
 * Clear task history older than specified days.
 */
export async function clearTaskHistory(days: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Get count before deletion
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        lte(tasks.createdAt, cutoffDate),
        inArray(tasks.status, ["completed", "failed"]),
      ),
    );

  const countBefore = countResult[0]?.count || 0;

  if (countBefore === 0) {
    return 0;
  }

  await db
    .delete(tasks)
    .where(
      and(
        lte(tasks.createdAt, cutoffDate),
        inArray(tasks.status, ["completed", "failed"]),
      ),
    );

  logger.info({ days, deletedCount: countBefore }, "Task history cleared");

  return countBefore;
}
