/**
 * Statistics service to fetch dashboard metrics.
 * Now uses tRPC for type-safe API calls.
 */

import { isPlatformBrowser } from "@angular/common";
import { Injectable, inject, signal, PLATFORM_ID } from "@angular/core";
import { from, of, tap, catchError } from "rxjs";

import { Statistics } from "../models";
import { TRPCService } from "../trpc/trpc.service";

@Injectable({
  providedIn: "root",
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
   * @param silent - If true, don't show loading state (for background updates)
   */
  loadStatistics(silent: boolean = false) {
    // Skip during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return of(null);
    }

    if (!silent) {
      this.loadingSignal.set(true);
    }
    this.errorSignal.set(null);

    return from(this.trpc.client.statistics.get.query()).pipe(
      tap((stats) => {
        this.statisticsSignal.set(stats);
        if (!silent) {
          this.loadingSignal.set(false);
        }
      }),
      catchError((error) => {
        // Only log errors in browser (SSR errors are expected and harmless)
        if (isPlatformBrowser(this.platformId)) {
          console.error("Failed to load statistics:", error);
          this.errorSignal.set("Failed to load statistics");
        }
        if (!silent) {
          this.loadingSignal.set(false);
        }
        return of(null);
      }),
    );
  }

  /**
   * Refresh statistics.
   */
  refresh() {
    return this.loadStatistics();
  }
}
