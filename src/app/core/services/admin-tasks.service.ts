/**
 * Admin tasks service.
 *
 * Provides tRPC client wrapper for admin task management.
 * Manages SSE connection for real-time updates.
 */

import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, from, of, shareReplay, Subject } from 'rxjs';
import { map, catchError, takeUntil } from 'rxjs/operators';
import { TRPCService } from '../trpc/trpc.service';
import { SSEService, type SSEEvent } from './sse.service';

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
}

export interface ScheduledTaskDetails extends ScheduledTask {
  scheduled: boolean;
  executionHistory: TaskExecution[];
}

export interface TaskExecution {
  id: number;
  executedAt: string;
  status: 'success' | 'failed';
  error: string | null;
  duration: number | null;
}

export interface Task {
  id: number;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  retries: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskFilters {
  status?: ('pending' | 'running' | 'completed' | 'failed')[];
  type?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface PaginatedTasks {
  items: Task[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TaskMetrics {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  byType: Record<string, { count: number; status: 'pending' | 'running' | 'completed' | 'failed' }>;
}

export interface WorkerPoolStatus {
  running: boolean;
  workerCount: number;
  activeWorkers: number;
  queueDepth: number;
}

export interface SchedulerStatus {
  running: boolean;
  scheduledTasks: number;
}

@Injectable({
  providedIn: 'root',
})
export class AdminTasksService {
  private trpc = inject(TRPCService);
  private sseService = inject(SSEService);
  private platformId = inject(PLATFORM_ID);

  // Signals for reactive state
  private tasksSignal = signal<Task[]>([]);
  readonly tasks = this.tasksSignal.asReadonly();

  private metricsSignal = signal<TaskMetrics | null>(null);
  readonly metrics = this.metricsSignal.asReadonly();

  private workerPoolStatusSignal = signal<WorkerPoolStatus | null>(null);
  readonly workerPoolStatus = this.workerPoolStatusSignal.asReadonly();

  private schedulerStatusSignal = signal<SchedulerStatus | null>(null);
  readonly schedulerStatus = this.schedulerStatusSignal.asReadonly();

  // SSE connection management
  private sseConnection$: Observable<SSEEvent> | null = null;
  private sseSubscribers = 0;
  private sseDestroy$ = new Subject<void>();

  /**
   * Scheduled Tasks
   */

  getScheduledTasks(): Observable<ScheduledTask[]> {
    return from(this.trpc.client.admin.tasks.listScheduled.query());
  }

  getScheduledTask(id: string): Observable<ScheduledTaskDetails> {
    return from(this.trpc.client.admin.tasks.getScheduled.query({ id }));
  }

  enableTask(id: string): Observable<void> {
    return from(this.trpc.client.admin.tasks.enableTask.mutate({ id })).pipe(
      map(() => undefined)
    );
  }

  disableTask(id: string): Observable<void> {
    return from(this.trpc.client.admin.tasks.disableTask.mutate({ id })).pipe(
      map(() => undefined)
    );
  }

  triggerTask(id: string): Observable<{ success: boolean }> {
    return from(this.trpc.client.admin.tasks.triggerTask.mutate({ id }));
  }

  getTaskHistory(id: string, days: number = 14): Observable<TaskExecution[]> {
    return from(this.trpc.client.admin.tasks.getTaskHistory.query({ id, days }));
  }

  /**
   * Task Queue
   */

  listTasks(
    filters?: TaskFilters,
    pagination?: Pagination
  ): Observable<PaginatedTasks> {
    return from(
      this.trpc.client.admin.tasks.listTasks.query({
        page: pagination?.page || 1,
        limit: pagination?.limit || 20,
        status: filters?.status,
        type: filters?.type,
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
      })
    );
  }

  getTaskDetails(id: number): Observable<Task> {
    return from(this.trpc.client.admin.tasks.getTaskDetails.query({ id }));
  }

  cancelTask(id: number): Observable<void> {
    return from(this.trpc.client.admin.tasks.cancelTask.mutate({ id })).pipe(
      map(() => undefined)
    );
  }

  retryTask(id: number): Observable<Task> {
    return from(this.trpc.client.admin.tasks.retryTask.mutate({ id }));
  }

  clearHistory(days: number = 14): Observable<number> {
    return from(this.trpc.client.admin.tasks.clearHistory.mutate({ days })).pipe(
      map(response => response.deleted)
    );
  }

  /**
   * Metrics
   */

  getMetrics(): Observable<TaskMetrics> {
    return from(this.trpc.client.admin.tasks.getMetrics.query()).pipe(
      map(metrics => {
        this.metricsSignal.set(metrics);
        return metrics;
      })
    );
  }

  getWorkerPoolStatus(): Observable<WorkerPoolStatus> {
    // Skip during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return of({ running: false, workerCount: 0, activeWorkers: 0, queueDepth: 0 });
    }

    return from(this.trpc.client.admin.tasks.getWorkerPoolStatus.query()).pipe(
      map(status => {
        this.workerPoolStatusSignal.set(status);
        return status;
      }),
      catchError(error => {
        console.error('Failed to load worker pool status:', error);
        return of({ running: false, workerCount: 0, activeWorkers: 0, queueDepth: 0 });
      })
    );
  }

  getSchedulerStatus(): Observable<SchedulerStatus> {
    // Skip during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return of({ running: false, scheduledTasks: 0 });
    }

    return from(this.trpc.client.admin.tasks.getSchedulerStatus.query()).pipe(
      map(status => {
        this.schedulerStatusSignal.set(status);
        return status;
      }),
      catchError(error => {
        console.error('Failed to load scheduler status:', error);
        return of({ running: false, scheduledTasks: 0 });
      })
    );
  }

  /**
   * SSE Connection for Real-time Updates
   * 
   * Uses a shared connection pattern - only one connection is maintained
   * and shared among all subscribers.
   */
  connectSSE(): Observable<SSEEvent> {
    // Only connect in browser
    if (!isPlatformBrowser(this.platformId)) {
      return new Observable<SSEEvent>(subscriber => {
        subscriber.complete();
      });
    }

    // If connection already exists, return it
    if (this.sseConnection$) {
      this.sseSubscribers++;
      return this.sseConnection$;
    }

    // Create new connection
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/api/admin/tasks/events`;

    // Create shared connection with replay
    this.sseConnection$ = this.sseService.connect(url).pipe(
      shareReplay(1),
      takeUntil(this.sseDestroy$)
    );

    this.sseSubscribers = 1;

    return this.sseConnection$;
  }

  /**
   * Disconnect from SSE.
   * Only disconnects when all subscribers have unsubscribed.
   */
  disconnectSSE(): void {
    this.sseSubscribers = Math.max(0, this.sseSubscribers - 1);
    
    if (this.sseSubscribers <= 0) {
      this.sseDestroy$.next();
      this.sseService.disconnect();
      this.sseConnection$ = null;
      this.sseSubscribers = 0;
      this.sseDestroy$ = new Subject<void>(); // Reset for next connection
    }
  }
}
