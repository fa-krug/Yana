/**
 * Event emitter service for broadcasting events to SSE clients.
 *
 * Provides a centralized event broadcasting system for real-time updates.
 */

import { logger } from '../utils/logger';

type EventCallback = (event: string, data: unknown) => void;

class EventEmitterService {
  private subscribers: Set<EventCallback> = new Set();

  /**
   * Emit an event to all subscribers.
   */
  emit(event: string, data: unknown): void {
    logger.debug({ event }, 'Emitting event');
    this.subscribers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        logger.error({ error, event }, 'Error in event subscriber');
      }
    });
  }

  /**
   * Subscribe to events.
   * Returns an unsubscribe function.
   */
  subscribe(callback: EventCallback): () => void {
    this.subscribers.add(callback);
    logger.debug({ subscriberCount: this.subscribers.size }, 'Event subscriber added');

    return () => {
      this.subscribers.delete(callback);
      logger.debug({ subscriberCount: this.subscribers.size }, 'Event subscriber removed');
    };
  }

  /**
   * Get subscriber count.
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }
}

// Singleton instance
let eventEmitter: EventEmitterService | null = null;

/**
 * Get event emitter instance.
 */
export function getEventEmitter(): EventEmitterService {
  if (!eventEmitter) {
    eventEmitter = new EventEmitterService();
  }
  return eventEmitter;
}
