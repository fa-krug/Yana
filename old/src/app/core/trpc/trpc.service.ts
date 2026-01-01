/**
 * tRPC service for Angular.
 *
 * Provides a singleton tRPC client instance.
 */

import { Injectable } from "@angular/core";

import { createTRPCClient, type AppRouter } from "./trpc-client";

@Injectable({
  providedIn: "root",
})
export class TRPCService {
  /**
   * tRPC client instance.
   */
  readonly client = createTRPCClient();

  /**
   * Get typed client for type-safe procedure calls.
   */
  getClient(): ReturnType<typeof createTRPCClient> {
    return this.client;
  }
}

/**
 * Export AppRouter type for use in services.
 */
export type { AppRouter };
