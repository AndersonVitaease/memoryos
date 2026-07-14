/**
 * ConnectorEventBus.ts
 * Sprint 6.4.1 — Universal Connector Runtime
 *
 * Append-only event bus for all connector lifecycle and execution events.
 * HMR-safe via globalThis anchor. No global mutable leakage across modules.
 * SRP: emit · subscribe · query — nothing else.
 */

import type { ConnectorEvent, ConnectorEventType } from './UCRTypes';

const BUS_KEY = '__UCR_EVENT_BUS__';

interface BusStore {
  events:    ConnectorEvent[];
  listeners: Map<ConnectorEventType, ((e: ConnectorEvent) => void)[]>;
  seq:       number;
}

function getBus(): BusStore {
  if (!(globalThis as any)[BUS_KEY]) {
    (globalThis as any)[BUS_KEY] = { events: [], listeners: new Map(), seq: 0 };
  }
  return (globalThis as any)[BUS_KEY];
}

type PartialEvent = Omit<ConnectorEvent, 'id' | 'timestamp' | 'requestId' | 'correlationId'> &
  Partial<Pick<ConnectorEvent, 'requestId' | 'correlationId'>>;

export class ConnectorEventBus {
  static emit(partial: PartialEvent): ConnectorEvent {
    const bus = getBus();
    const event: ConnectorEvent = {
      id:            `cevt-${Date.now()}-${++bus.seq}`,
      timestamp:     new Date().toISOString(),
      requestId:     partial.requestId  ?? `req-${bus.seq}`,
      correlationId: partial.correlationId ?? `corr-${bus.seq}`,
      eventType:     partial.eventType,
      connectorId:   partial.connectorId,
      connectionId:  partial.connectionId,
      organizationId: partial.organizationId,
      actor:         partial.actor,
      payload:       partial.payload,
      status:        partial.status,
    };
    bus.events.push(event);

    const handlers = bus.listeners.get(event.eventType) ?? [];
    for (const h of handlers) {
      try { h(event); } catch { /* listeners must never crash the bus */ }
    }
    return event;
  }

  static subscribe(type: ConnectorEventType, handler: (e: ConnectorEvent) => void): () => void {
    const bus = getBus();
    const existing = bus.listeners.get(type) ?? [];
    bus.listeners.set(type, [...existing, handler]);
    return () => {
      const cur = bus.listeners.get(type) ?? [];
      bus.listeners.set(type, cur.filter((h) => h !== handler));
    };
  }

  static query(filter?: {
    eventType?:    ConnectorEventType;
    connectorId?:  string;
    connectionId?: string;
    since?:        string;
    limit?:        number;
  }): ConnectorEvent[] {
    let r = [...getBus().events];
    if (filter?.eventType)    r = r.filter((e) => e.eventType === filter.eventType);
    if (filter?.connectorId)  r = r.filter((e) => e.connectorId === filter.connectorId);
    if (filter?.connectionId) r = r.filter((e) => e.connectionId === filter.connectionId);
    if (filter?.since)        r = r.filter((e) => e.timestamp >= filter.since!);
    return r.slice(-(filter?.limit ?? 500));
  }

  static count(): number { return getBus().events.length; }
  static clear(): void   { getBus().events = []; getBus().seq = 0; }

  static health(): { status: 'ok'; total: number } {
    return { status: 'ok', total: getBus().events.length };
  }
}