// ─── Working Memory Engine — EventPublisher ───────────────────────────────────
// Sprint 1 · Foundation v1.0 · MCF EventBus contract

import type { MemoryEvent } from "./types";
import type { IEventPublisher } from "./interfaces";

type Listener = (event: MemoryEvent) => void;

/**
 * Simple synchronous EventPublisher.
 * Production replaces with async EventBus adapter.
 * @implements IEventPublisher
 */
export class EventPublisher implements IEventPublisher {
  private readonly listeners: Listener[] = [];

  publish(event: MemoryEvent): void {
    for (const fn of this.listeners) {
      try { fn(event); } catch { /* isolate listener errors */ }
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  listenerCount(): number {
    return this.listeners.length;
  }
}