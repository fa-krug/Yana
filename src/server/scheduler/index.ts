/**
 * Scheduler for periodic tasks.
 *
 * Uses node-cron for cron-based scheduling.
 */

import cron, { type ScheduledTask as CronScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';

export type ScheduledTask = {
  id: string;
  name: string;
  cronExpression: string;
  task: () => Promise<void> | void;
  enabled: boolean;
};

class Scheduler {
  private tasks: Map<string, CronScheduledTask> = new Map();
  private taskDefinitions: Map<string, ScheduledTask> = new Map();
  private running = false;

  /**
   * Schedule a task.
   */
  scheduleTask(taskDef: ScheduledTask): void {
    if (!taskDef.enabled) {
      logger.debug({ taskId: taskDef.id }, 'Task disabled, skipping');
      return;
    }

    // Validate cron expression
    if (!cron.validate(taskDef.cronExpression)) {
      logger.error(
        { taskId: taskDef.id, cronExpression: taskDef.cronExpression },
        'Invalid cron expression'
      );
      return;
    }

    // Cancel existing task if any
    this.cancelTask(taskDef.id);

    // Schedule new task
    const scheduledTask = cron.schedule(
      taskDef.cronExpression,
      async () => {
        logger.info({ taskId: taskDef.id, name: taskDef.name }, 'Executing scheduled task');
        try {
          await taskDef.task();
          logger.info({ taskId: taskDef.id }, 'Scheduled task completed');
        } catch (error) {
          logger.error({ error, taskId: taskDef.id }, 'Scheduled task failed');
          // Task will be retried on next schedule if needed
          // For critical tasks, could implement retry logic here
        }
      },
      {
        timezone: 'UTC',
      }
    );

    // Start task if scheduler is running
    if (this.running) {
      scheduledTask.start();
    }

    this.tasks.set(taskDef.id, scheduledTask);
    this.taskDefinitions.set(taskDef.id, taskDef);

    logger.info(
      { taskId: taskDef.id, name: taskDef.name, cronExpression: taskDef.cronExpression },
      'Task scheduled'
    );
  }

  /**
   * Cancel a scheduled task.
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.stop();
      this.tasks.delete(taskId);
      logger.info({ taskId }, 'Task cancelled');
    }
  }

  /**
   * Start scheduler.
   */
  start(): void {
    if (this.running) {
      logger.warn('Scheduler already running');
      return;
    }

    this.running = true;

    // Start all scheduled tasks
    for (const task of this.tasks.values()) {
      task.start();
    }

    logger.info('Scheduler started');
  }

  /**
   * Stop scheduler.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    // Stop all tasks
    for (const task of this.tasks.values()) {
      task.stop();
    }

    logger.info('Scheduler stopped');
  }

  /**
   * List all scheduled tasks.
   */
  listScheduledTasks(): ScheduledTask[] {
    return Array.from(this.taskDefinitions.values());
  }

  /**
   * Get task by ID.
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.taskDefinitions.get(taskId);
  }

  /**
   * Get task status with execution info.
   */
  getTaskStatus(taskId: string): {
    enabled: boolean;
    scheduled: boolean;
  } {
    const taskDef = this.taskDefinitions.get(taskId);
    if (!taskDef) {
      throw new Error(`Task ${taskId} not found`);
    }

    const scheduledTask = this.tasks.get(taskId);
    const scheduled = scheduledTask !== undefined;

    return {
      enabled: taskDef.enabled,
      scheduled,
    };
  }

  /**
   * Enable a scheduled task.
   */
  enableTask(taskId: string): void {
    const taskDef = this.taskDefinitions.get(taskId);
    if (!taskDef) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (taskDef.enabled) {
      logger.debug({ taskId }, 'Task already enabled');
      return;
    }

    taskDef.enabled = true;
    this.scheduleTask(taskDef);
    logger.info({ taskId }, 'Task enabled');
  }

  /**
   * Disable a scheduled task.
   */
  disableTask(taskId: string): void {
    const taskDef = this.taskDefinitions.get(taskId);
    if (!taskDef) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!taskDef.enabled) {
      logger.debug({ taskId }, 'Task already disabled');
      return;
    }

    taskDef.enabled = false;
    this.cancelTask(taskId);
    logger.info({ taskId }, 'Task disabled');
  }

  /**
   * Trigger a scheduled task manually.
   */
  async triggerTask(taskId: string): Promise<void> {
    const taskDef = this.taskDefinitions.get(taskId);
    if (!taskDef) {
      throw new Error(`Task ${taskId} not found`);
    }

    logger.info({ taskId, name: taskDef.name }, 'Manually triggering scheduled task');
    try {
      await taskDef.task();
      logger.info({ taskId }, 'Manually triggered task completed');
    } catch (error) {
      logger.error({ error, taskId }, 'Manually triggered task failed');
      throw error;
    }
  }

  /**
   * Check if scheduler is running.
   */
  isRunning(): boolean {
    return this.running;
  }
}

// Singleton instance
let scheduler: Scheduler | null = null;

/**
 * Get scheduler instance.
 */
export function getScheduler(): Scheduler {
  if (!scheduler) {
    scheduler = new Scheduler();
  }
  return scheduler;
}
