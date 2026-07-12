/**
 * MockRuntimeEventBus.ts
 * In-process event bus for runtime internal events — EF-31A validation.
 * EF-31A · 2026-07-12
 */

export type RuntimeEventType =
  | 'ConnectorRegistered'
  | 'ConnectorLoaded'
  | 'ConnectorInitialized'
  | 'ConnectorConnected'
  | 'ConnectorExecutionStarted'
  | 'ConnectorExecutionCompleted'
  | 'ConnectorExecutionFailed'
  | 'ConnectorRetry'
  | 'ConnectorTimeout'
  | 'ConnectorRateLimited'
  | 'ConnectorHealthChanged'
  | 'ConnectorRecovered'
  | 'ConnectorDeprecated'
  | 'ConnectorDisconnected'
  | 'ConnectorShutdown';

export interface RuntimeEvent {
  readonly id: string;
  readonly type: RuntimeEventType;
  readonly connectorId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
}

type EventHandler = (event: RuntimeEvent) => void;

export class MockRuntimeEventBus {
  private readonly handlers = new Map<RuntimeEventType, EventHandler[]>();
  private readonly emittedEvents: RuntimeEvent[] = [];
  private emitCount = 0;

  on(type: RuntimeEventType, handler: EventHandler): void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
  }

  emit(type: RuntimeEventType, connectorId: string, payload: Record<string, unknown> = {}): void {
    this.emitCount++;
    const event: RuntimeEvent = Object.freeze({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      connectorId,
      payload,
      timestamp: new Date().toISOString(),
    });
    this.emittedEvents.push(event);
    const handlers = this.handlers.get(type) ?? [];
    handlers.forEach(h => h(event));
  }

  getAll(): RuntimeEvent[] { return [...this.emittedEvents]; }

  getByType(type: RuntimeEventType): RuntimeEvent[] {
    return this.emittedEvents.filter(e => e.type === type);
  }

  getByConnector(connectorId: string): RuntimeEvent[] {
    return this.emittedEvents.filter(e => e.connectorId === connectorId);
  }

  hasEmitted(type: RuntimeEventType): boolean {
    return this.emittedEvents.some(e => e.type === type);
  }

  clear(): void { this.emittedEvents.length = 0; this.emitCount = 0; }

  statistics() {
    return {
      emitCount: this.emitCount,
      totalEvents: this.emittedEvents.length,
      registeredHandlers: [...this.handlers.values()].reduce((s, h) => s + h.length, 0),
      byType: Object.fromEntries(
        [...new Set(this.emittedEvents.map(e => e.type))].map(t => [t, this.emittedEvents.filter(e => e.type === t).length])
      ),
    };
  }
}