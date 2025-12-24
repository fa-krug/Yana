/**
 * Admin tasks router.
 *
 * Handles admin task management endpoints.
 * All procedures require superuser access.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getScheduler } from "@server/scheduler";
import { getExecutionHistory } from "@server/services/taskHistory.service";
import {
  listTasks,
  getTaskDetails,
  cancelTask,
  retryTask,
  clearTaskHistory,
  type TaskFilters,
} from "@server/services/taskQueue.service";
import { taskListSchema } from "@server/validation/schemas";
import {
  getTaskMetrics,
  getWorkerPoolStatus,
} from "@server/workers/monitoring";

import { router, superuserProcedure } from "../procedures";

/**
 * Helper to convert date to ISO string.
 */
const toISOString = (
  date: Date | number | string | null | undefined,
): string => {
  if (!date) return new Date().toISOString();
  if (date instanceof Date) return date.toISOString();
  if (typeof date === "number") return new Date(date).toISOString();
  if (typeof date === "string") return date;
  return new Date().toISOString();
};

/**
 * Admin tasks router.
 */
export const adminTasksRouter = router({
  /**
   * Scheduled Tasks
   */

  /**
   * List all scheduled tasks.
   */
  listScheduled: superuserProcedure.query(async () => {
    const scheduler = getScheduler();
    const tasks = scheduler.listScheduledTasks();

    return tasks.map((task) => ({
      id: task.id,
      name: task.name,
      cronExpression: task.cronExpression,
      enabled: task.enabled,
    }));
  }),

  /**
   * Get scheduled task details.
   */
  getScheduled: superuserProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const scheduler = getScheduler();
      const task = scheduler.getTask(input.id);

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Scheduled task ${input.id} not found`,
        });
      }

      const status = scheduler.getTaskStatus(input.id);
      const history = await getExecutionHistory(input.id, 14);

      return {
        id: task.id,
        name: task.name,
        cronExpression: task.cronExpression,
        enabled: task.enabled,
        scheduled: status.scheduled,
        executionHistory: history.map((h) => ({
          id: h.id,
          executedAt: toISOString(h.executedAt),
          status: h.status,
          error: h.error || null,
          duration: h.duration || null,
        })),
      };
    }),

  /**
   * Enable a scheduled task.
   */
  enableTask: superuserProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const scheduler = getScheduler();
      try {
        scheduler.enableTask(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Failed to enable task",
        });
      }
    }),

  /**
   * Disable a scheduled task.
   */
  disableTask: superuserProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const scheduler = getScheduler();
      try {
        scheduler.disableTask(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Failed to disable task",
        });
      }
    }),

  /**
   * Manually trigger a scheduled task.
   */
  triggerTask: superuserProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const scheduler = getScheduler();
      try {
        await scheduler.triggerTask(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to trigger task",
        });
      }
    }),

  /**
   * Get execution history for a scheduled task.
   */
  getTaskHistory: superuserProcedure
    .input(
      z.object({
        id: z.string(),
        days: z.number().int().positive().max(30).optional().default(14),
      }),
    )
    .query(async ({ input }) => {
      const history = await getExecutionHistory(input.id, input.days);

      return history.map((h) => ({
        id: h.id,
        executedAt: toISOString(h.executedAt),
        status: h.status,
        error: h.error || null,
        duration: h.duration || null,
      }));
    }),

  /**
   * Task Queue
   */

  /**
   * List tasks with filters and pagination.
   */
  listTasks: superuserProcedure
    .input(taskListSchema)
    .query(async ({ input }) => {
      const filters: TaskFilters = {
        status: input.status,
        type: input.type,
        dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
      };

      const pagination = {
        page: input.page,
        limit: input.limit,
      };

      const result = await listTasks(filters, pagination);

      return {
        ...result,
        items: result.items.map((task) => ({
          ...task,
          createdAt: toISOString(task.createdAt),
          updatedAt: toISOString(task.updatedAt),
          startedAt: task.startedAt ? toISOString(task.startedAt) : null,
          completedAt: task.completedAt ? toISOString(task.completedAt) : null,
          payload:
            typeof task.payload === "string"
              ? JSON.parse(task.payload)
              : task.payload,
          result: task.result
            ? typeof task.result === "string"
              ? JSON.parse(task.result)
              : task.result
            : null,
        })),
      };
    }),

  /**
   * Get task details by ID.
   */
  getTaskDetails: superuserProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const task = await getTaskDetails(input.id);

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Task ${input.id} not found`,
        });
      }

      return {
        ...task,
        createdAt: toISOString(task.createdAt),
        updatedAt: toISOString(task.updatedAt),
        startedAt: task.startedAt ? toISOString(task.startedAt) : null,
        completedAt: task.completedAt ? toISOString(task.completedAt) : null,
        payload:
          typeof task.payload === "string"
            ? JSON.parse(task.payload)
            : task.payload,
        result: task.result
          ? typeof task.result === "string"
            ? JSON.parse(task.result)
            : task.result
          : null,
      };
    }),

  /**
   * Cancel a running or pending task.
   */
  cancelTask: superuserProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        await cancelTask(input.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Failed to cancel task",
        });
      }
    }),

  /**
   * Retry a failed task.
   */
  retryTask: superuserProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const task = await retryTask(input.id);

      if (!task) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Task cannot be retried (not found or exceeded max retries)",
        });
      }

      return {
        ...task,
        createdAt: toISOString(task.createdAt),
        updatedAt: toISOString(task.updatedAt),
        startedAt: task.startedAt ? toISOString(task.startedAt) : null,
        completedAt: task.completedAt ? toISOString(task.completedAt) : null,
        payload:
          typeof task.payload === "string"
            ? JSON.parse(task.payload)
            : task.payload,
        result: task.result
          ? typeof task.result === "string"
            ? JSON.parse(task.result)
            : task.result
          : null,
      };
    }),

  /**
   * Clear task history.
   */
  clearHistory: superuserProcedure
    .input(z.object({ days: z.number().int().positive().max(365).default(14) }))
    .mutation(async ({ input }) => {
      const deleted = await clearTaskHistory(input.days);
      return { deleted };
    }),

  /**
   * Metrics
   */

  /**
   * Get task metrics.
   */
  getMetrics: superuserProcedure.query(async () => {
    return await getTaskMetrics();
  }),

  /**
   * Get worker pool status.
   */
  getWorkerPoolStatus: superuserProcedure.query(async () => {
    return await getWorkerPoolStatus();
  }),

  /**
   * Get scheduler status.
   */
  getSchedulerStatus: superuserProcedure.query(async () => {
    const scheduler = getScheduler();
    return {
      running: scheduler.isRunning(),
      scheduledTasks: scheduler.listScheduledTasks().length,
    };
  }),
});
