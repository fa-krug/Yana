/**
 * Worker health checks.
 */

import { getWorkerMetrics } from './monitoring';
import { logger } from '../utils/logger';

/**
 * Get worker health status.
 */
export async function getWorkerHealth(): Promise<{
  healthy: boolean;
  metrics: Awaited<ReturnType<typeof getWorkerMetrics>>;
}> {
  try {
    const metrics = await getWorkerMetrics();

    // Consider unhealthy if queue depth is too high
    const healthy = metrics.queueDepth < 1000;

    return {
      healthy,
      metrics,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get worker health');
    return {
      healthy: false,
      metrics: {
        pendingTasks: 0,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        queueDepth: 0,
      },
    };
  }
}
