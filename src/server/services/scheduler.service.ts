/**
 * Scheduler service.
 *
 * Manages scheduled tasks configuration and execution.
 */

import { getScheduler } from "../scheduler";
import {
  aggregateAllFeedsTask,
  deleteOldArticlesTask,
  cleanupTaskHistoryTask,
  fetchFeedIconsTask,
} from "../scheduler/tasks";
import { logger } from "../utils/logger";

const AGGREGATION_SCHEDULE =
  process.env["AGGREGATION_SCHEDULE"] || "*/30 * * * *"; // Every 30 minutes

let schedulerInitialized = false;

/**
 * Initialize and start scheduler.
 */
export function startScheduler(): void {
  // Prevent duplicate initialization
  if (schedulerInitialized) {
    logger.warn("Scheduler already initialized, skipping");
    return;
  }

  const scheduler = getScheduler();

  // Schedule: Aggregate all feeds
  scheduler.scheduleTask({
    id: "aggregate_all_feeds",
    name: "Aggregate All Feeds",
    cronExpression: AGGREGATION_SCHEDULE,
    task: aggregateAllFeedsTask,
    enabled: true,
  });

  // Schedule: Delete old articles (daily at 1 AM)
  scheduler.scheduleTask({
    id: "delete_old_articles",
    name: "Delete Old Articles",
    cronExpression: "0 1 * * *",
    task: () => deleteOldArticlesTask(2), // 2 months
    enabled: true,
  });

  // Schedule: Cleanup task history (daily at 2 AM)
  scheduler.scheduleTask({
    id: "cleanup_task_history",
    name: "Cleanup Task History",
    cronExpression: "0 2 * * *",
    task: () => cleanupTaskHistoryTask(7), // 7 days
    enabled: true,
  });

  // Schedule: Fetch feed icons (daily at 3 AM)
  scheduler.scheduleTask({
    id: "fetch_feed_icons",
    name: "Fetch Feed Icons",
    cronExpression: "0 3 * * *",
    task: fetchFeedIconsTask,
    enabled: true,
  });

  // Start scheduler
  scheduler.start();

  schedulerInitialized = true;
  logger.info("Scheduler initialized and started");
}

/**
 * Stop scheduler.
 */
export function stopScheduler(): void {
  const scheduler = getScheduler();
  scheduler.stop();
  logger.info("Scheduler stopped");
}

/**
 * Get scheduler status.
 */
export function getSchedulerStatus(): {
  running: boolean;
  tasks: Array<{
    id: string;
    name: string;
    cronExpression: string;
    enabled: boolean;
  }>;
} {
  const scheduler = getScheduler();
  const tasks = scheduler.listScheduledTasks();

  return {
    running: true, // Scheduler is always running if initialized
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      cronExpression: t.cronExpression,
      enabled: t.enabled,
    })),
  };
}
