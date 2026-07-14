/**
 * IdentityEventBus.ts
 * Sprint 6.4.0 — Universal Identity & Trust Platform
 *
 * Append-only event log for all identity events.
 * All ITP components emit events here — consumers subscribe or query.
 * HMR-safe via globalThis anchor. No global mutable leakage across modules.
 *
 * SRP: emit, subscribe, query — nothing else.
 */

import type { IdentityEvent, IdentityEventType } from './ITPTypes';

const BUS_KEY = '__ITP_EVENT_BUS__';

interface BusStore {
  events:    IdentityEvent[];
  listeners: Map<string, ((evt: IdentityEvent) => void)[]>;
  seq:       number;
}

function getBus(): BusStore {
  if (!(globalThis as any)[BUS_KEY]) {
    (globalThis as any)[BUS_KEY] = {
      events:    [],
      listeners: new Map(),
      seq:       0,
    };
  }
  return (globalThis as any)[BUS_KEY];
}

type PartialEvent = Omit<IdentityEvent, 'id' | 'timestamp' | 'requestId' | 'correlationId'> &
  Partial<Pick<IdentityEvent, 'requestId' | 'correlationId'>>;

export class IdentityEventBus {
  static emit(partial: PartialEvent): IdentityEvent {
    const bus = getBus();
    const event: IdentityEvent = {
      id:             `ievt-${Date.now()}-${++bus.seq}`,
      timestamp:      new Date().toISOString(),
      requestId:      partial.requestId ?? `req-${bus.seq}`,
      correlationId:  partial.correlationId ?? `corr-${bus.seq}`,
      providerId:     partial.providerId,
      connectionId:   partial.connectionId,
      organizationId: partial.organizationId,
      actor:          partial.actor,
      eventType:      partial.eventType,
      payload:        partial.payload,
      status:         partial.status,
    };
    bus.events.push(event);

    // Notify type-specific listeners.
    const handlers = bus.listeners.get(event.eventType) ?? [];
    for (const h of handlers) {
      try { h(event); } catch { /* listener errors must never crash the bus */ }
    }

    return event;
  }

  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  static subscribe(eventType: IdentityEventType, handler: (evt: IdentityEvent) => void): () => void {
    const bus = getBus();
    const existing = bus.listeners.get(eventType) ?? [];
    bus.listeners.set(eventType, [...existing, handler]);
    return () => {
      const current = bus.listeners.get(eventType) ?? [];
      bus.listeners.set(eventType, current.filter((h) => h !== handler));
    };
  }

  /** Returns all events, optionally filtered by type, providerId, or connectionId. */
  static query(filter?: {
    eventType?:    IdentityEventType;
    providerId?:   string;
    connectionId?: string;
    since?:        string;
    limit?:        number;
  }): IdentityEvent[] {
    let results = [...getBus().events];

    if (filter?.eventType)    results = results.filter((e) => e.eventType === filter.eventType);
    if (filter?.providerId)   results = results.filter((e) => e.providerId === filter.providerId);
    if (filter?.connectionId) results = results.filter((e) => e.connectionId === filter.connectionId);
    if (filter?.since)        results = results.filter((e) => e.timestamp >= filter.since!);

    results = results.slice(-(filter?.limit ?? 500));
    return results;
  }

  static count(): number { return getBus().events.length; }
  static clear(): void { getBus().events = []; getBus().seq = 0; }
}