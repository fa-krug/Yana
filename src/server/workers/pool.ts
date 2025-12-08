/**
 * Worker pool for processing tasks.
 *
 * Manages worker processes for parallel task execution.
 */

import { fork, spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  getNextTask,
  updateTaskStatus,
  retryTask,
} from "../services/taskQueue.service";
import { logger } from "../utils/logger";

const WORKER_COUNT = parseInt(process.env["WORKER_COUNT"] || "4", 10);
const POLL_INTERVAL = 5000; // 5 seconds
const NODE_ENV = process.env["NODE_ENV"] || "development";
const isDevelopment = NODE_ENV === "development";

/**
 * Get directory name in ESM-compatible way.
 * Supports both ESM (import.meta.url) and CommonJS (__dirname).
 * In ESM context (Vite), resolves to actual source file location.
 */
function getDirname(): string {
  try {
    // ESM: use import.meta.url - this gives us the actual source file location
    if (typeof import.meta !== "undefined" && import.meta.url) {
      const filePath = fileURLToPath(import.meta.url);
      // If we're in Vite's bundled context, try to find the actual source location
      // by looking for 'src' in the path or falling back to process.cwd()
      const dirname = path.dirname(filePath);
      // Check if we're in a Vite bundle path (contains .angular or vite-root)
      if (dirname.includes(".angular") || dirname.includes("vite-root")) {
        // Use process.cwd() and resolve relative to project root
        return path.resolve(process.cwd(), "src/server/workers");
      }
      return dirname;
    }
  } catch {
    // Fall through to CommonJS
  }
  // CommonJS: use __dirname
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof __dirname !== "undefined"
    ? __dirname
    : (globalThis as any).__dirname || process.cwd();
}

export class WorkerPool {
  private workers: ChildProcess[] = [];
  private running = false;
  private pollInterval: NodeJS.Timeout | null = null;

  /**
   * Start worker pool.
   */
  start(): void {
    if (this.running) {
      logger.warn("Worker pool already running");
      return;
    }

    this.running = true;
    logger.info({ workerCount: WORKER_COUNT }, "Starting worker pool");

    // Spawn workers immediately
    while (this.workers.length < WORKER_COUNT) {
      this.spawnWorker();
    }

    // Start polling for tasks
    this.startPolling();

    // Handle graceful shutdown
    process.on("SIGTERM", () => this.stop());
    process.on("SIGINT", () => this.stop());
  }

  /**
   * Stop worker pool.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    logger.info("Stopping worker pool");

    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Kill all workers
    for (const worker of this.workers) {
      worker.kill();
    }

    // Wait for workers to exit
    await Promise.all(
      this.workers.map(
        (worker) =>
          new Promise<void>((resolve) => {
            worker.once("exit", () => resolve());
          }),
      ),
    );

    this.workers = [];
    logger.info("Worker pool stopped");
  }

  /**
   * Start polling for tasks.
   */
  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.running) return;

      // Check for available workers
      const availableWorkers = this.workers.filter(
        (w) => !w.connected || w.killed,
      );

      // Clean up dead workers
      this.workers = this.workers.filter((w) => w.connected && !w.killed);

      // Spawn new workers if needed
      while (this.workers.length < WORKER_COUNT && this.running) {
        this.spawnWorker();
      }

      // Process tasks
      await this.processNextTask();
    }, POLL_INTERVAL);
  }

  /**
   * Spawn a new worker process.
   */
  private spawnWorker(): void {
    let worker: ChildProcess;
    const dirname = getDirname();
    const projectRoot = process.cwd();

    if (isDevelopment) {
      // Development: use tsx to run TypeScript directly
      const workerPath = path.join(dirname, "worker.ts");
      const tsxBin = path.join(projectRoot, "node_modules", ".bin", "tsx");

      if (fs.existsSync(tsxBin)) {
        worker = spawn(tsxBin, [workerPath], {
          stdio: ["inherit", "inherit", "inherit", "ipc"],
        });
      } else {
        worker = spawn("npx", ["tsx", workerPath], {
          stdio: ["inherit", "inherit", "inherit", "ipc"],
        });
      }
    } else {
      // Production: use pre-bundled worker.mjs
      const workerPath = path.join(projectRoot, "dist/scripts/worker.mjs");
      worker = fork(workerPath, [], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
      });
    }

    worker.on(
      "message",
      (message: {
        type: string;
        taskId: number;
        result?: unknown;
        error?: string;
      }) => {
        if (message.type === "task_complete") {
          updateTaskStatus(
            message.taskId,
            "completed",
            message.result as Record<string, unknown>,
          ).catch((err) =>
            logger.error({ error: err }, "Failed to update task status"),
          );
        } else if (message.type === "task_failed") {
          updateTaskStatus(
            message.taskId,
            "failed",
            undefined,
            message.error,
          ).catch((err) =>
            logger.error({ error: err }, "Failed to update task status"),
          );

          // Retry if possible
          retryTask(message.taskId).catch((err) =>
            logger.error({ error: err }, "Failed to retry task"),
          );
        }
      },
    );

    worker.on("exit", (code, signal) => {
      logger.warn({ code, signal }, "Worker process exited");
      // Worker will be cleaned up in next poll
    });

    this.workers.push(worker);
    logger.debug({ workerId: worker.pid }, "Worker spawned");
  }

  /**
   * Process next task.
   */
  private async processNextTask(): Promise<void> {
    // Find available worker
    const availableWorker = this.workers.find((w) => w.connected && !w.killed);

    if (!availableWorker) {
      return; // No available workers
    }

    // Get next task
    const task = await getNextTask();

    if (!task) {
      return; // No pending tasks
    }

    // Send task to worker
    availableWorker.send({
      type: "process_task",
      task: {
        id: task.id,
        type: task.type,
        payload: JSON.parse(task.payload as string),
      },
    });

    logger.debug(
      { taskId: task.id, workerId: availableWorker.pid },
      "Task assigned to worker",
    );
  }

  /**
   * Get worker pool status.
   */
  getStatus(): {
    running: boolean;
    workerCount: number;
    activeWorkers: number;
  } {
    const activeWorkers = this.workers.filter(
      (w) => w.connected && !w.killed,
    ).length;
    return {
      running: this.running,
      workerCount: this.workers.length,
      activeWorkers,
    };
  }
}

// Singleton instance
let workerPool: WorkerPool | null = null;

/**
 * Get worker pool instance.
 */
export function getWorkerPool(): WorkerPool {
  if (!workerPool) {
    workerPool = new WorkerPool();
  }
  return workerPool;
}
