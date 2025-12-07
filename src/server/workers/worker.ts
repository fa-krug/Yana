/**
 * Worker process for task execution.
 *
 * This runs in a separate process and processes tasks from the queue.
 */

import { processFeedAggregation, processArticleReload } from '../services/aggregation.service';
import { processIconFetch } from '../services/icon.service';
import { logger } from '../utils/logger';

interface TaskMessage {
  type: 'process_task';
  task: {
    id: number;
    type: string;
    payload: Record<string, unknown>;
  };
}

/**
 * Process a task.
 */
async function processTask(task: TaskMessage['task']): Promise<void> {
  logger.info({ taskId: task.id, taskType: task.type }, 'Processing task');

  try {
    let result: unknown;

    switch (task.type) {
      case 'aggregate_feed': {
        const { feedId, forceRefresh } = task.payload as {
          feedId: number;
          forceRefresh: boolean;
        };
        result = await processFeedAggregation(feedId, forceRefresh);
        break;
      }

      case 'aggregate_article': {
        const { articleId } = task.payload as { articleId: number };
        await processArticleReload(articleId);
        result = { success: true };
        break;
      }

      case 'fetch_icon': {
        const { feedId } = task.payload as { feedId: number };
        await processIconFetch(feedId);
        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    // Send success message to parent
    if (process.send) {
      process.send({
        type: 'task_complete',
        taskId: task.id,
        result,
      });
    }
  } catch (error) {
    logger.error({ error, taskId: task.id }, 'Task processing failed');

    // Send error message to parent
    if (process.send) {
      process.send({
        type: 'task_failed',
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Listen for messages from parent process
process.on('message', (message: TaskMessage) => {
  if (message.type === 'process_task') {
    processTask(message.task).catch(error => {
      logger.error({ error }, 'Unhandled error in worker');
      process.exit(1);
    });
  }
});

// Handle uncaught errors
process.on('uncaughtException', error => {
  logger.error({ error }, 'Uncaught exception in worker');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection in worker');
  process.exit(1);
});
