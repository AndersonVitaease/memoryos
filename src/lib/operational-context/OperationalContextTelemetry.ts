/**
 * OperationalContextTelemetry.ts — Sprint C-03.0
 * Coleta eventos e metricas do Operational Context.
 *
 * Em memoria — nao persiste entre reloads.
 * Auditoria: OperationalBindingCreated / Used / Updated / Removed / Expired
 */

// ── Audit event types ─────────────────────────────────────────────────────────

export type AuditEventType =
  | "OperationalBindingCreated"
  | "OperationalBindingUsed"
  | "OperationalBindingUpdated"
  | "OperationalBindingRemoved"
  | "OperationalBindingExpired";

export interface OperationalAuditEvent {
  readonly type:          AuditEventType;
  readonly entityId:      string;
  readonly canonicalName: string;
  readonly connectorId:   string;
  readonly resourceId:    string;
  readonly alias?:        string;
  readonly reason?:       string;
  readonly durationMs?:   number;
  readonly timestamp:     number;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface OperationalContextMetrics {
  readonly bindingsCreated:   number;
  readonly bindingsUsed:      number;
  readonly bindingsUpdated:   number;
  readonly bindingsRemoved:   number;
  readonly bindingsExpired:   number;
  readonly avgLookupMs:       number;
  readonly avgBindMs:         number;
  readonly reuseRate:         string;
}

// ── Collector ─────────────────────────────────────────────────────────────────

export class OperationalContextTelemetryCollector {
  private readonly _events:    OperationalAuditEvent[] = [];
  private _lookupMs:           number[] = [];
  private _bindMs:             number[] = [];

  emit(event: OperationalAuditEvent): void {
    this._events.push(Object.freeze(event));
  }

  recordLookup(ms: number): void { this._lookupMs.push(ms); }
  recordBind(ms: number):   void { this._bindMs.push(ms); }

  events(): readonly OperationalAuditEvent[] { return this._events; }

  metrics(): Readonly<OperationalContextMetrics> {
    const count = (t: AuditEventType) => this._events.filter(e => e.type === t).length;
    const avg   = (arr: number[])     => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const created = count("OperationalBindingCreated");
    const used    = count("OperationalBindingUsed");
    return Object.freeze({
      bindingsCreated:  created,
      bindingsUsed:     used,
      bindingsUpdated:  count("OperationalBindingUpdated"),
      bindingsRemoved:  count("OperationalBindingRemoved"),
      bindingsExpired:  count("OperationalBindingExpired"),
      avgLookupMs:      parseFloat(avg(this._lookupMs).toFixed(2)),
      avgBindMs:        parseFloat(avg(this._bindMs).toFixed(2)),
      reuseRate:        created > 0 ? `${Math.round(used / created * 100)}%` : "0%",
    });
  }

  reset(): void {
    this._events.length = 0;
    this._lookupMs = [];
    this._bindMs   = [];
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__OC_TELEMETRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new OperationalContextTelemetryCollector();
}
export const OCTelemetry: OperationalContextTelemetryCollector = (
  globalThis as unknown as Record<string, OperationalContextTelemetryCollector>
)[_KEY];