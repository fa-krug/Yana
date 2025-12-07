/**
 * Worker pool monitoring and metrics.
 */

import { getTasksByStatus, listTasks } from "../services/taskQueue.service";
import { getWorkerPool } from "./pool";
import { logger } from "../utils/logger";
import { db, tasks } from "../db";
import { sql } from "drizzle-orm";
import type { TaskStatus } from "../services/taskQueue.service";

export interface WorkerMetrics {
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  queueDepth: number;
}

export interface WorkerPoolStatus {
  running: boolean;
  workerCount: number;
  activeWorkers: number;
  queueDepth: number;
}

export interface TaskMetrics {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
  byType: Record<string, { count: number; status: TaskStatus }>;
}

/**
 * Get worker pool metrics.
 */
export async function getWorkerMetrics(): Promise<WorkerMetrics> {
  const [pending, running, completed, failed] = await Promise.all([
    getTasksByStatus("pending", 1000),
    getTasksByStatus("running", 1000),
    getTasksByStatus("completed", 100),
    getTasksByStatus("failed", 100),
  ]);

  return {
    pendingTasks: pending.length,
    runningTasks: running.length,
    completedTasks: completed.length,
    failedTasks: failed.length,
    queueDepth: pending.length + running.length,
  };
}

/**
 * Get worker pool status.
 */
export async function getWorkerPoolStatus(): Promise<WorkerPoolStatus> {
  const pool = getWorkerPool();
  const status = pool.getStatus();
  const metrics = await getWorkerMetrics();

  return {
    running: status.running,
    workerCount: status.workerCount,
    activeWorkers: status.activeWorkers,
    queueDepth: metrics.queueDepth,
  };
}

/**
 * Get detailed task metrics.
 */
export async function getTaskMetrics(): Promise<TaskMetrics> {
  // Get counts by status
  const [pending, running, completed, failed] = await Promise.all([
    getTasksByStatus("pending", 1000),
    getTasksByStatus("running", 1000),
    getTasksByStatus("completed", 100),
    getTasksByStatus("failed", 100),
  ]);

  // Get total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks);
  const total = totalResult[0]?.count || 0;

  // Get breakdown by type
  const typeBreakdown = await db
    .select({
      type: tasks.type,
      status: tasks.status,
      count: sql<number>`count(*)`,
    })
    .from(tasks)
    .groupBy(tasks.type, tasks.status);

  const byType: Record<string, { count: number; status: TaskStatus }> = {};
  for (const row of typeBreakdown) {
    if (!byType[row.type]) {
      byType[row.type] = { count: 0, status: row.status as TaskStatus };
    }
    byType[row.type].count += row.count;
  }

  return {
    pending: pending.length,
    running: running.length,
    completed: completed.length,
    failed: failed.length,
    total,
    byType,
  };
}
