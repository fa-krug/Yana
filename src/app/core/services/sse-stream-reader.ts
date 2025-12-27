/**
 * SSE stream reader that handles parsing Server-Sent Events protocol.
 * Extracts and parses SSE format (event:, data:, id:, retry: fields).
 */

import { Subject } from "rxjs";

export interface SSEEvent {
  event: string;
  data: unknown;
  id?: string;
}

/**
 * Reads and parses Server-Sent Events from a ReadableStream.
 * Handles line-by-line buffering, SSE format parsing, and event emission.
 */
export class SSEStreamReader {
  private buffer = "";

  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private decoder: TextDecoder,
    private subject: Subject<SSEEvent>,
    private signal: AbortSignal,
  ) {}

  /**
   * Read the stream and emit SSE events.
   * Throws error if stream reading fails.
   */
  async readStream(): Promise<void> {
    try {
      await this.processStream();
    } finally {
      this.reader.releaseLock();
    }
  }

  /**
   * Process the stream by reading chunks and parsing SSE events.
   */
  private async processStream(): Promise<void> {
    while (true) {
      const { done, value } = await this.reader.read();

      if (done) {
        break;
      }

      if (this.signal.aborted) {
        return;
      }

      // Decode chunk and add to buffer
      this.buffer += this.decoder.decode(value, { stream: true });

      // Process complete lines
      this.processLines();
    }
  }

  /**
   * Process buffered lines and emit complete SSE events.
   */
  private processLines(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || ""; // Keep incomplete line in buffer

    let currentEvent: Partial<SSEEvent> | null = null;

    for (const line of lines) {
      currentEvent = this.processLine(line, currentEvent);
      if (currentEvent === null) {
        // Event was completed and emitted
        currentEvent = null;
      }
    }
  }

  /**
   * Process a single SSE protocol line.
   * Returns the current event being built (or null if event was completed).
   */
  private processLine(
    line: string,
    currentEvent: Partial<SSEEvent> | null,
  ): Partial<SSEEvent> | null {
    const trimmed = line.trim();

    // Handle empty lines and comments
    if (!trimmed || trimmed.startsWith(":")) {
      return this.handleEmptyOrComment(trimmed, currentEvent);
    }

    // Parse SSE format fields (event:, data:, id:, retry:)
    return this.parseSSEField(trimmed, currentEvent);
  }

  /**
   * Handle empty lines and comment lines in SSE stream.
   */
  private handleEmptyOrComment(
    trimmed: string,
    currentEvent: Partial<SSEEvent> | null,
  ): Partial<SSEEvent> | null {
    if (trimmed === "" && currentEvent) {
      // Empty line = end of event, emit it
      if (currentEvent.event && currentEvent.data !== undefined) {
        this.subject.next({
          event: currentEvent.event,
          data: currentEvent.data,
          id: currentEvent.id,
        });
      }
      return null; // Signal that event was completed
    }
    return currentEvent;
  }

  /**
   * Parse an SSE protocol field (event:, data:, id:, retry:).
   */
  private parseSSEField(
    trimmed: string,
    currentEvent: Partial<SSEEvent> | null,
  ): Partial<SSEEvent> | null {
    if (trimmed.startsWith("event:")) {
      return { event: trimmed.slice(6).trim() };
    }

    if (trimmed.startsWith("data:")) {
      return this.parseDataField(trimmed, currentEvent);
    }

    if (trimmed.startsWith("id:")) {
      if (!currentEvent) {
        currentEvent = {};
      }
      currentEvent.id = trimmed.slice(3).trim();
      return currentEvent;
    }

    // retry: field is handled but not used (we manage our own retry logic)
    return currentEvent;
  }

  /**
   * Parse the data: field and attempt to parse as JSON.
   */
  private parseDataField(
    trimmed: string,
    currentEvent: Partial<SSEEvent> | null,
  ): Partial<SSEEvent> {
    const dataStr = trimmed.slice(5).trim();
    if (!currentEvent) {
      currentEvent = { event: "message" };
    }
    try {
      currentEvent.data = JSON.parse(dataStr);
    } catch {
      currentEvent.data = dataStr;
    }
    return currentEvent;
  }
}
