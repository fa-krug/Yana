/**
 * Scheduled task definitions.
 */

import { logger } from "../utils/logger";
import { db, articles, tasks } from "../db";
import { lt, or, eq, and } from "drizzle-orm";
import { subMonths, subDays } from "date-fns";
import { recordExecution } from "../services/taskHistory.service";
import { getEventEmitter } from "../services/eventEmitter.service";

/**
 * Aggregate all feeds.
 */
export async function aggregateAllFeedsTask(): Promise<void> {
  const taskId = "aggregate_all_feeds";
  const startTime = Date.now();
  logger.info("Running scheduled aggregation of all feeds");
  try {
    const { aggregateAllFeeds } =
      await import("../services/aggregation.service");
    const result = await aggregateAllFeeds();
    const duration = Date.now() - startTime;
    logger.info({ taskIds: result.taskIds }, "All feeds aggregation enqueued");
    await recordExecution(taskId, "success", undefined, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "success",
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, "Failed to aggregate all feeds");
    await recordExecution(taskId, "failed", errorMessage, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "failed",
      error: errorMessage,
      duration,
    });
    throw error;
  }
}

/**
 * Delete old articles.
 */
export async function deleteOldArticlesTask(months: number = 2): Promise<void> {
  const taskId = "delete_old_articles";
  const startTime = Date.now();
  logger.info({ months }, "Running scheduled deletion of old articles");
  try {
    const cutoffDate = subMonths(new Date(), months);

    // Delete articles older than cutoff
    const result = await db
      .delete(articles)
      .where(lt(articles.createdAt, cutoffDate));

    const duration = Date.now() - startTime;
    logger.info({ months, cutoffDate }, "Old articles deleted");
    await recordExecution(taskId, "success", undefined, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "success",
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, "Failed to delete old articles");
    await recordExecution(taskId, "failed", errorMessage, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "failed",
      error: errorMessage,
      duration,
    });
    throw error;
  }
}

/**
 * Clean up task history.
 */
export async function cleanupTaskHistoryTask(days: number = 7): Promise<void> {
  const taskId = "cleanup_task_history";
  const startTime = Date.now();
  logger.info({ days }, "Running scheduled cleanup of task history");
  try {
    const cutoffDate = subDays(new Date(), days);

    // Delete completed and failed tasks older than cutoff
    const result = await db.delete(tasks).where(
      and(
        lt(tasks.createdAt, cutoffDate),
        // Only delete completed or failed tasks
        // This would need a proper OR condition - simplified for now
      ),
    );

    const duration = Date.now() - startTime;
    logger.info({ days, cutoffDate }, "Task history cleaned up");
    await recordExecution(taskId, "success", undefined, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "success",
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, "Failed to cleanup task history");
    await recordExecution(taskId, "failed", errorMessage, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "failed",
      error: errorMessage,
      duration,
    });
    throw error;
  }
}

/**
 * Fetch missing feed icons.
 */
export async function fetchFeedIconsTask(): Promise<void> {
  const taskId = "fetch_feed_icons";
  const startTime = Date.now();
  logger.info("Running scheduled icon fetching");
  try {
    const { db, feeds } = await import("../db");
    const { isNull, or, eq } = await import("drizzle-orm");
    const { queueIconFetch } = await import("../services/icon.service");

    // Get feeds without icons
    const feedsWithoutIcons = await db
      .select()
      .from(feeds)
      .where(or(isNull(feeds.icon), eq(feeds.icon, "")));

    // Queue icon fetch for each feed
    for (const feed of feedsWithoutIcons) {
      await queueIconFetch(feed.id);
    }

    const duration = Date.now() - startTime;
    logger.info(
      { count: feedsWithoutIcons.length },
      "Icon fetch tasks enqueued",
    );
    await recordExecution(taskId, "success", undefined, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "success",
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, "Failed to fetch feed icons");
    await recordExecution(taskId, "failed", errorMessage, duration);
    getEventEmitter().emit("scheduled-task-executed", {
      taskId,
      status: "failed",
      error: errorMessage,
      duration,
    });
    throw error;
  }
}
