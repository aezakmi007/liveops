import type { LogEvent } from "@liveops/shared";

/**
 * Fixed-capacity history buffer. Oldest events are dropped once `capacity`
 * is exceeded, which bounds server memory regardless of stream rate.
 */
export class RingBuffer {
  private readonly capacity: number;
  private buffer: LogEvent[] = [];

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(events: LogEvent[]): void {
    this.buffer.push(...events);
    if (this.buffer.length > this.capacity) {
      this.buffer = this.buffer.slice(this.buffer.length - this.capacity);
    }
  }

  /** Most recent `limit` events, oldest first. */
  recent(limit: number): LogEvent[] {
    if (limit >= this.buffer.length) return [...this.buffer];
    return this.buffer.slice(this.buffer.length - limit);
  }

  /** Events strictly newer than `since` (epoch ms), oldest first. */
  since(since: number): LogEvent[] {
    // Buffer is append-ordered by ts, so a linear scan from the end is
    // enough and avoids a full binary-search implementation for this demo.
    const idx = this.buffer.findIndex((e) => e.ts > since);
    return idx === -1 ? [] : this.buffer.slice(idx);
  }

  get size(): number {
    return this.buffer.length;
  }
}
