/**
 * Statistics service to fetch dashboard metrics.
 * Now uses tRPC for type-safe API calls.
 */

import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { from, of } from 'rxjs';
import { tap, catchError } from 'rxjs';
import { Statistics } from '../models';
import { TRPCService } from '../trpc/trpc.service';

@Injectable({
  providedIn: 'root',
})
export class StatisticsService {
  private trpc = inject(TRPCService);
  private platformId = inject(PLATFORM_ID);

  // Signal for statistics
  private statisticsSignal = signal<Statistics | null>(null);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);

  // Public readonly signals
  readonly statistics = this.statisticsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Load statistics from the API.
   * Only loads in browser (not during SSR).
   */
  loadStatistics() {
    // Skip during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return of(null);
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return from(this.trpc.client.statistics.get.query()).pipe(
      tap(stats => {
        this.statisticsSignal.set(stats);
        this.loadingSignal.set(false);
      }),
      catchError(error => {
        // Only log errors in browser (SSR errors are expected and harmless)
        if (isPlatformBrowser(this.platformId)) {
          console.error('Failed to load statistics:', error);
          this.errorSignal.set('Failed to load statistics');
        }
        this.loadingSignal.set(false);
        return of(null);
      })
    );
  }

  /**
   * Refresh statistics.
   */
  refresh() {
    return this.loadStatistics();
  }
}
