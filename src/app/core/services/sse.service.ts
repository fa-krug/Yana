/**
 * Server-Sent Events service.
 *
 * Clean, simple SSE implementation with proper error handling and reconnection.
 * Uses fetch API to support credentials (cookies) for authentication.
 */

import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subject, throwError, timer } from 'rxjs';
import { catchError, retryWhen, delayWhen, takeUntil } from 'rxjs/operators';

export interface SSEEvent {
  event: string;
  data: unknown;
  id?: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

@Injectable({
  providedIn: 'root',
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
      return new Observable<SSEEvent>(subscriber => {
        subscriber.complete();
      });
    }

    const subject = new Subject<SSEEvent>();

    const connect = () => {
      // Clean up any existing connection
      this.disconnect();

      this.abortController = new AbortController();
      const signal = this.abortController.signal;

      this.connectionState$.next('connecting');
      this.reconnectAttempts = 0;

      fetch(url, {
        method: 'GET',
        credentials: 'include', // CRITICAL: Include cookies for authentication
        redirect: 'manual', // Don't follow redirects automatically - handle them explicitly
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal,
      })
        .then(response => {
          // Check for redirects (authentication failures)
          // With redirect: 'manual', we get the actual redirect status
          if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
            const location = response.headers.get('Location');
            throw new Error(`Authentication required. Redirected to: ${location || 'login'}`);
          }

          // Check for other errors
          if (!response.ok) {
            throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
          }

          // Check for response body
          if (!response.body) {
            throw new Error('SSE response has no body');
          }

          this.connectionState$.next('connected');
          this.reconnectAttempts = 0;

          // Read the stream
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const readStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  break;
                }

                // Decode chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                let currentEvent: Partial<SSEEvent> | null = null;

                for (const line of lines) {
                  const trimmed = line.trim();

                  // Skip empty lines and comments
                  if (!trimmed || trimmed.startsWith(':')) {
                    if (trimmed === '' && currentEvent) {
                      // Empty line = end of event, emit it
                      if (currentEvent.event && currentEvent.data !== undefined) {
                        subject.next({
                          event: currentEvent.event,
                          data: currentEvent.data,
                          id: currentEvent.id,
                        });
                      }
                      currentEvent = null;
                    }
                    continue;
                  }

                  // Parse SSE format
                  if (trimmed.startsWith('event:')) {
                    currentEvent = { event: trimmed.slice(6).trim() };
                  } else if (trimmed.startsWith('data:')) {
                    const dataStr = trimmed.slice(5).trim();
                    if (!currentEvent) {
                      currentEvent = { event: 'message' };
                    }
                    try {
                      currentEvent.data = JSON.parse(dataStr);
                    } catch {
                      currentEvent.data = dataStr;
                    }
                  } else if (trimmed.startsWith('id:')) {
                    if (!currentEvent) {
                      currentEvent = {};
                    }
                    currentEvent.id = trimmed.slice(3).trim();
                  } else if (trimmed.startsWith('retry:')) {
                    // Server can suggest retry delay, but we handle it ourselves
                    // Could use this in the future
                  }
                }
              }
            } catch (error) {
              if (signal.aborted) {
                return;
              }
              throw error;
            } finally {
              reader.releaseLock();
            }
          };

          // Start reading
          readStream().catch(error => {
            if (!signal.aborted) {
              console.error('[SSE] Stream read error:', error);
              this.connectionState$.next('error');
              subject.error(error);
            }
          });
        })
        .catch(error => {
          if (signal.aborted) {
            return; // Intentionally disconnected
          }

          console.error('[SSE] Connection error:', error);

          // Don't retry on authentication errors
          if (
            error.message?.includes('Authentication') ||
            error.message?.includes('redirected') ||
            error.message?.includes('401') ||
            error.message?.includes('403')
          ) {
            this.connectionState$.next('error');
            subject.error(error);
            return;
          }

          // Retry for other errors
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            this.connectionState$.next('connecting');

            setTimeout(() => {
              if (!signal.aborted) {
                connect();
              }
            }, delay);
          } else {
            this.connectionState$.next('error');
            subject.error(new Error('Max reconnection attempts reached'));
          }
        });
    };

    // Start connection
    connect();

    return subject.asObservable().pipe(
      catchError(error => {
        console.error('[SSE] Observable error:', error);
        return throwError(() => error);
      })
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
    this.connectionState$.next('disconnected');
    this.reconnectAttempts = 0;
  }
}
