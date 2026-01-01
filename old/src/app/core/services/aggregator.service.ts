/**
 * Aggregator service - manages aggregator discovery.
 * Now uses tRPC for type-safe API calls.
 */

import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, from, of, tap, catchError, map } from "rxjs";

import {
  Aggregator,
  AggregatorList,
  AggregatorDetail,
  AggregatorOption,
} from "../models";
import { TRPCService } from "../trpc/trpc.service";

export interface AggregatorFilters {
  search?: string;
  type?: "managed" | "social" | "custom";
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: "root" })
export class AggregatorService {
  private trpc = inject(TRPCService);

  private allAggregatorsSignal = signal<Aggregator[]>([]);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);
  private searchQuerySignal = signal<string>("");
  private typeFilterSignal = signal<"managed" | "social" | "custom" | null>(
    null,
  );
  private currentPageSignal = signal<number>(1);
  private pageSizeSignal = signal<number>(6);

  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly searchQuery = this.searchQuerySignal.asReadonly();
  readonly typeFilter = this.typeFilterSignal.asReadonly();
  readonly currentPage = this.currentPageSignal.asReadonly();
  readonly pageSize = this.pageSizeSignal.asReadonly();

  // Computed filtered and paginated aggregators
  readonly filteredAggregators = computed(() => {
    let filtered = [...this.allAggregatorsSignal()];

    // Apply search filter
    const search = this.searchQuerySignal().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (agg) =>
          agg.name.toLowerCase().includes(search) ||
          agg.id.toLowerCase().includes(search) ||
          (agg.description && agg.description.toLowerCase().includes(search)),
      );
    }

    // Apply type filter
    const type = this.typeFilterSignal();
    if (type) {
      filtered = filtered.filter((agg) => agg.type === type);
    }

    return filtered;
  });

  readonly paginatedAggregators = computed(() => {
    const filtered = this.filteredAggregators();
    const page = this.currentPageSignal();
    const pageSize = this.pageSizeSignal();
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  });

  readonly totalCount = computed(() => this.filteredAggregators().length);
  readonly totalPages = computed(() =>
    Math.ceil(this.totalCount() / this.pageSizeSignal()),
  );

  /**
   * Load available aggregators
   */
  loadAggregators(filters?: AggregatorFilters): Observable<AggregatorList> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return from(this.trpc.client.aggregator.grouped.query()).pipe(
      tap((response) => {
        // Flatten all aggregators into a single array
        const allAggregators = [
          ...response.managed,
          ...response.social,
          ...response.custom,
        ];
        this.allAggregatorsSignal.set(allAggregators);
        this.loadingSignal.set(false);

        // Apply filters if provided
        if (filters?.search) {
          this.searchQuerySignal.set(filters.search);
        }
        if (filters?.type) {
          this.typeFilterSignal.set(filters.type);
        }
        if (filters?.page) {
          this.currentPageSignal.set(filters.page);
        }
        if (filters?.page_size) {
          this.pageSizeSignal.set(filters.page_size);
        }
      }),
      catchError((error) => {
        console.error("Error loading aggregators:", error);
        this.errorSignal.set(error.message || "Failed to load aggregators");
        this.loadingSignal.set(false);
        return of({ managed: [], social: [], custom: [] });
      }),
    );
  }

  /**
   * Set search query
   */
  setSearch(query: string) {
    this.searchQuerySignal.set(query);
    this.currentPageSignal.set(1); // Reset to first page
  }

  /**
   * Set type filter
   */
  setTypeFilter(type: "managed" | "social" | "custom" | null) {
    this.typeFilterSignal.set(type);
    this.currentPageSignal.set(1); // Reset to first page
  }

  /**
   * Set page
   */
  setPage(page: number) {
    this.currentPageSignal.set(page);
  }

  /**
   * Set page size
   */
  setPageSize(pageSize: number) {
    this.pageSizeSignal.set(pageSize);
    this.currentPageSignal.set(1); // Reset to first page
  }

  /**
   * Get aggregator by module path (id)
   */
  getAggregator(modulePath: string): Aggregator | null {
    const allAggregators = this.allAggregatorsSignal();
    return (
      allAggregators.find(
        (a) => a.id === modulePath || a.modulePath === modulePath,
      ) || null
    );
  }

  /**
   * Get detailed aggregator information including identifier fields and options
   */
  getAggregatorDetail(aggregatorId: string): Observable<AggregatorDetail> {
    return from(
      this.trpc.client.aggregator.getById.query({ id: aggregatorId }),
    ).pipe(
      map((detail) => ({
        id: detail.id,
        identifierType: detail.identifierType,
        identifierLabel: detail.identifierLabel,
        identifierDescription: detail.identifierDescription,
        identifierPlaceholder: detail.identifierPlaceholder,
        identifierChoices: detail.identifierChoices,
        identifierEditable: detail.identifierEditable,
        options: detail.options as Record<string, AggregatorOption>,
        prefillName: detail.prefillName,
      })),
      catchError((error) => {
        console.error("Error loading aggregator detail:", error);
        return of({
          id: aggregatorId,
          identifierType: "url" as const,
          identifierLabel: "Identifier",
          identifierDescription: "",
          identifierPlaceholder: "",
          identifierChoices: undefined,
          identifierEditable: false,
          options: {},
          prefillName: true,
        } as AggregatorDetail);
      }),
    );
  }
}
