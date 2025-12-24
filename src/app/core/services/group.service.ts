/**
 * Group service - manages feed group CRUD operations and state.
 * Uses tRPC for type-safe API calls.
 */

import { Injectable, inject, signal } from "@angular/core";
import { Observable, from, of, tap, catchError, map } from "rxjs";

import { Group } from "../models";
import { TRPCService } from "../trpc/trpc.service";

@Injectable({ providedIn: "root" })
export class GroupService {
  private trpc = inject(TRPCService);

  private groupsSignal = signal<Group[]>([]);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);

  readonly groups = this.groupsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Load groups for the current user
   */
  loadGroups(): Observable<Group[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return from(this.trpc.client.group.list.query()).pipe(
      map((groups) => groups || []),
      tap((groups) => {
        this.groupsSignal.set(groups);
        this.loadingSignal.set(false);
      }),
      catchError((error) => {
        console.error("Error loading groups:", error);
        this.errorSignal.set(error.message || "Failed to load groups");
        this.loadingSignal.set(false);
        return of([]);
      }),
    );
  }

  /**
   * Get a single group by ID
   */
  getGroup(id: number): Observable<Group> {
    return from(this.trpc.client.group.getById.query({ id }));
  }

  /**
   * Create a new group
   */
  createGroup(name: string): Observable<Group> {
    return from(this.trpc.client.group.create.mutate({ name })).pipe(
      tap(() => {
        // Reload groups after creation
        this.loadGroups().subscribe();
      }),
    );
  }

  /**
   * Update a group
   */
  updateGroup(id: number, name: string): Observable<Group> {
    return from(this.trpc.client.group.update.mutate({ id, name })).pipe(
      tap(() => {
        // Reload groups after update
        this.loadGroups().subscribe();
      }),
    );
  }

  /**
   * Delete a group
   */
  deleteGroup(id: number): Observable<{ success: boolean }> {
    return from(this.trpc.client.group.delete.mutate({ id })).pipe(
      tap(() => {
        // Reload groups after deletion
        this.loadGroups().subscribe();
      }),
      map(() => ({ success: true })),
    );
  }

  /**
   * Get groups for a feed
   */
  getFeedGroups(feedId: number): Observable<Group[]> {
    return from(this.trpc.client.group.getFeedGroups.query({ feedId })).pipe(
      map((groups) => groups || []),
    );
  }
}
