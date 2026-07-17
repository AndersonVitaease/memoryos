// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-07: RuntimeAuditSink
// Official event sink between RuntimeEventBus and the Audit Engine.
// Audit MUST consume this sink — never call bus.history() directly.
//
// Flow:  Stage → RuntimeEventBus → RuntimeAuditSink → AuditEngine
// ══════════════════════════════════════════════════════════════════════════════

import type { RuntimeEvent } from "../runtime-infra/RuntimeEvent";
import type { RuntimeEventBus } from "../runtime-infra/RuntimeEventBus";

export interface AuditRecord {
  readonly type:        string;
  readonly executionId: string;
  readonly timestamp:   number;
  readonly detail?:     string;
  readonly payload?:    Record<string, unknown>;
}

export class RuntimeAuditSink {
  private readonly _records: AuditRecord[] = [];

  /** Subscribe to the bus — must be called before pipeline execution starts. */
  attach(bus: RuntimeEventBus): void {
    bus.subscribe("*", (event: RuntimeEvent) => {
      this._records.push(Object.freeze({
        type:        event.type,
        executionId: event.executionId,
        timestamp:   event.timestamp,
        detail:      event.detail,
        payload:     event.payload,
      }));
    });
  }

  /** Return all records collected since attachment. */
  drain(): readonly AuditRecord[] {
    return Object.freeze([...this._records]);
  }

  /** Count records matching a specific event type. */
  countByType(type: string): number {
    return this._records.filter(r => r.type === type).length;
  }

  /** Check whether at least one event of a given type was received. */
  hasType(type: string): boolean {
    return this._records.some(r => r.type === type);
  }

  /** Reset for reuse in tests. */
  reset(): void {
    this._records.length = 0;
  }
}