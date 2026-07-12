/**
 * RuntimeEventBus.ts
 * Production Runtime Event Bus — integrated into ConnectorRuntime.
 * Emits all 15 official lifecycle + execution events.
 * EF-31B · 2026-07-12 · Version: 1.0.0
 *
 * Constitution: events are immutable, ordered, append-only.
 * Observers receive but cannot modify events.
 */

export type RuntimeEventType =
  | 'ConnectorRegistered'
  | 'ConnectorLoaded'
  | 'ConnectorInitialized'
  | 'ConnectorConnected'
  | 'ConnectorDisconnected'
  | 'ConnectorExecutionStarted'
  | 'ConnectorExecutionCompleted'
  | 'ConnectorExecutionFailed'
  | 'ConnectorRetry'
  | 'ConnectorTimeout'
  | 'ConnectorRateLimited'
  | 'ConnectorHealthChanged'
  | 'ConnectorRecovered'
  | 'ConnectorDeprecated'
  | 'ConnectorShutdown';

export interface RuntimeEvent {
  readonly id: string;
  readonly type: RuntimeEventType;
  readonly connectorId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
  readonly sequenceNumber: number;
}

type EventHandler = (event: RuntimeEvent) => void;

export class RuntimeEventBus {
  private readonly handlers = new Map<RuntimeEventType, EventHandler[]>();
  private readonly globalHandlers: EventHandler[] = [];
  private readonly events: RuntimeEvent[] = [];
  private sequence = 0;
  private emitCount = 0;
  private errorCount = 0;

  on(type: RuntimeEventType, handler: EventHandler): () => void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
    // Return unsubscribe function
    return () => {
      const current = this.handlers.get(type) ?? [];
      this.handlers.set(type, current.filter(h => h !== handler));
    };
  }

  onAny(handler: EventHandler): () => void {
    this.globalHandlers.push(handler);
    return () => {
      const idx = this.globalHandlers.indexOf(handler);
      if (idx >= 0) this.globalHandlers.splice(idx, 1);
    };
  }

  emit(type: RuntimeEventType, connectorId: string, payload: Record<string, unknown> = {}): RuntimeEvent {
    this.emitCount++;
    this.sequence++;

    const event: RuntimeEvent = Object.freeze({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      connectorId,
      payload: Object.freeze({ ...payload }),
      timestamp: new Date().toISOString(),
      sequenceNumber: this.sequence,
    });

    this.events.push(event);

    // Dispatch to type-specific handlers
    const typeHandlers = this.handlers.get(type) ?? [];
    for (const h of [...typeHandlers, ...this.globalHandlers]) {
      try { h(event); }
      catch { this.errorCount++; /* handler errors must not affect the bus */ }
    }

    return event;
  }

  getAll(): readonly RuntimeEvent[] { return this.events; }

  getByType(type: RuntimeEventType): RuntimeEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getByConnector(connectorId: string): RuntimeEvent[] {
    return this.events.filter(e => e.connectorId === connectorId);
  }

  hasEmitted(type: RuntimeEventType, connectorId?: string): boolean {
    return this.events.some(e =>
      e.type === type && (connectorId === undefined || e.connectorId === connectorId)
    );
  }

  /** Confirm chronological ordering invariant */
  isChronologicallyOrdered(): boolean {
    for (let i = 1; i < this.events.length; i++) {
      if (this.events[i].sequenceNumber <= this.events[i - 1].sequenceNumber) return false;
      if (this.events[i].timestamp < this.events[i - 1].timestamp) return false;
    }
    return true;
  }

  recent(limit = 50): RuntimeEvent[] {
    return this.events.slice(-limit);
  }

  statistics() {
    const byType: Record<string, number> = {};
    for (const e of this.events) byType[e.type] = (byType[e.type] ?? 0) + 1;
    return {
      emitCount: this.emitCount,
      totalEvents: this.events.length,
      errorCount: this.errorCount,
      sequence: this.sequence,
      registeredHandlers: [...this.handlers.values()].reduce((s, h) => s + h.length, 0) + this.globalHandlers.length,
      byType,
    };
  }

  health() {
    return {
      status: (this.errorCount > 10 ? 'DEGRADED' : 'HEALTHY') as 'HEALTHY' | 'DEGRADED',
      details: `${this.emitCount} events emitted, ${this.errorCount} handler errors`,
      checks: {
        chronologicallyOrdered: this.isChronologicallyOrdered(),
        handlersIntact: this.errorCount === 0,
      },
      checkedAt: new Date().toISOString(),
    };
  }
}