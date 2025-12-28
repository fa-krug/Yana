/**
 * Server-Sent Events service.
 *
 * Clean, simple SSE implementation with proper error handling and reconnection.
 * Uses fetch API to support credentials (cookies) for authentication.
 */

import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { Observable, Subject, throwError } from "rxjs";
import { catchError } from "rxjs/operators";

import { SSEStreamReader, type SSEEvent } from "./sse-stream-reader";

export type { SSEEvent };

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

@Injectable({
  providedIn: "root",
})
export class SSEService {
  private platformId = inject(PLATFORM_ID);
  private abortController: AbortController | null = null;
  private connectionState$ = new Subject<ConnectionState>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 2000; // 2 seconds

  /**
   * Get connection state observable.
   */
  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  /**
   * Connect to SSE endpoint.
   * Returns observable that emits SSE events.
   */
  connect(url: string): Observable<SSEEvent> {
    // Only connect in browser
    if (!isPlatformBrowser(this.platformId)) {
      return new Observable<SSEEvent>((subscriber) => {
        subscriber.complete();
      });
    }

    const subject = new Subject<SSEEvent>();

    const connect = () => {
      // Clean up any existing connection
      this.disconnect();

      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      this.connectionState$.next("connecting");
      this.reconnectAttempts = 0;

      fetch(url, {
        method: "GET",
        credentials: "include", // CRITICAL: Include cookies for authentication
        redirect: "manual", // Don't follow redirects automatically - handle them explicitly
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        signal,
      })
        .then((response) => {
          // Check for redirects (authentication failures)
          // With redirect: 'manual', we get the actual redirect status
          if (
            response.status === 302 ||
            response.status === 301 ||
            response.status === 307 ||
            response.status === 308
          ) {
            const location = response.headers.get("Location");
            throw new Error(
              `Authentication required. Redirected to: ${location || "login"}`,
            );
          }

          // Check for other errors
          if (!response.ok) {
            throw new Error(
              `SSE connection failed: ${response.status} ${response.statusText}`,
            );
          }

          // Check for response body
          if (!response.body) {
            throw new Error("SSE response has no body");
          }

          this.connectionState$.next("connected");
          this.reconnectAttempts = 0;

          // Read and parse the stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          const streamReader = new SSEStreamReader(
            reader,
            decoder,
            subject,
            signal,
          );

          streamReader.readStream().catch((error) => {
            if (!signal.aborted) {
              console.error("[SSE] Stream read error:", error);
              this.connectionState$.next("error");
              subject.error(error);
            }
          });
        })
        .catch((error) => {
          if (signal.aborted) {
            return; // Intentionally disconnected
          }

          console.error("[SSE] Connection error:", error);

          // Don't retry on authentication errors
          if (
            error.message?.includes("Authentication") ||
            error.message?.includes("redirected") ||
            error.message?.includes("401") ||
            error.message?.includes("403")
          ) {
            this.connectionState$.next("error");
            subject.error(error);
            return;
          }

          // Retry for other errors
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            this.connectionState$.next("connecting");

            setTimeout(() => {
              if (!signal.aborted) {
                connect();
              }
            }, delay);
          } else {
            this.connectionState$.next("error");
            subject.error(new Error("Max reconnection attempts reached"));
          }
        });
    };

    // Start connection
    connect();

    return subject.asObservable().pipe(
      catchError((error) => {
        console.error("[SSE] Observable error:", error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Disconnect from SSE endpoint.
   */
  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.connectionState$.next("disconnected");
    this.reconnectAttempts = 0;
  }
}
