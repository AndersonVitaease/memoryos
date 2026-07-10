/**
 * MRI — MemoryOS Reference Implementation
 * Universal Event Bus (MCS + MRS Capítulo 5)
 *
 * Priority scheduler, retry com backoff, DLQ, idempotência.
 */

import type { UniversalEvent, EventHandler, UnsubscribeFn, IEventBus } from "../interfaces";

interface QueuedEvent {
  event:    UniversalEvent;
  attempts: number;
}

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };
const MAX_RETRIES = 3;

export class EventBus implements IEventBus {
  private subscriptions = new Map<string, Set<EventHandler>>();
  private patternSubs:    Array<{ pattern: RegExp; handler: EventHandler }> = [];
  private queue:          QueuedEvent[] = [];
  private dlq:            UniversalEvent[] = [];
  private processedIds  = new Set<string>();
  private stats = { published: 0, delivered: 0, failed: 0, dlqSize: 0 };
  private processing = false;

  async publish(raw: Omit<UniversalEvent, "eventId" | "timestamp">): Promise<void> {
    const event: UniversalEvent = {
      ...raw,
      eventId:   `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    this.stats.published++;
    this.queue.push({ event, attempts: 0 });
    this.queue.sort((a, b) =>
      (PRIORITY_ORDER[a.event.priority] ?? 1) - (PRIORITY_ORDER[b.event.priority] ?? 1)
    );
    if (!this.processing) this.drain();
  }

  async publishBatch(raws: Array<Omit<UniversalEvent, "eventId" | "timestamp">>): Promise<void> {
    await Promise.all(raws.map(r => this.publish(r)));
  }

  subscribe(eventType: string, handler: EventHandler): UnsubscribeFn {
    if (!this.subscriptions.has(eventType)) this.subscriptions.set(eventType, new Set());
    this.subscriptions.get(eventType)!.add(handler);
    return () => this.subscriptions.get(eventType)?.delete(handler);
  }

  subscribePattern(pattern: RegExp, handler: EventHandler): UnsubscribeFn {
    const entry = { pattern, handler };
    this.patternSubs.push(entry);
    return () => { this.patternSubs = this.patternSubs.filter(e => e !== entry); };
  }

  getStats() {
    return { ...this.stats, dlqSize: this.dlq.length };
  }

  private async drain(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await this.dispatch(item);
    }
    this.processing = false;
  }

  private async dispatch(item: QueuedEvent): Promise<void> {
    const { event } = item;

    // Idempotência
    if (this.processedIds.has(event.eventId)) return;
    this.processedIds.add(event.eventId);

    const handlers = this.getHandlers(event.type);
    if (handlers.length === 0) return;

    const results = await Promise.allSettled(handlers.map(h => h(event)));

    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      if (item.attempts < MAX_RETRIES) {
        // Retry com backoff
        const delay = Math.pow(2, item.attempts) * 500;
        await new Promise(r => setTimeout(r, delay));
        this.processedIds.delete(event.eventId); // permite re-entrega
        item.attempts++;
        this.queue.unshift(item);
        return;
      }
      // DLQ
      this.dlq.push(event);
      this.stats.failed++;
    } else {
      this.stats.delivered++;
    }
  }

  private getHandlers(type: string): EventHandler[] {
    const direct = [...(this.subscriptions.get(type) ?? [])];
    const pattern = this.patternSubs
      .filter(e => e.pattern.test(type))
      .map(e => e.handler);
    return [...direct, ...pattern];
  }
}