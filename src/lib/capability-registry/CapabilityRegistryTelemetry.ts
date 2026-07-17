/**
 * CapabilityRegistryTelemetry.ts — Sprint C-03.6.1
 * Auditoria e métricas do Capability Registry.
 *
 * Eventos obrigatórios:
 *   CapabilityRegistered
 *   CapabilityRemoved
 *   CapabilityLookup
 *   CapabilityDiscovery
 *   DuplicateRegistrationRejected
 *   RegistryCleared
 */

export type CREventType =
  | "CapabilityRegistered"
  | "CapabilityRemoved"
  | "CapabilityLookup"
  | "CapabilityDiscovery"
  | "DuplicateRegistrationRejected"
  | "InvalidDescriptorRejected"
  | "RegistryCleared";

export interface CRAuditEvent {
  readonly type:         CREventType;
  readonly capabilityId?: string;
  readonly criterion?:   string;
  readonly count?:       number;
  readonly durationMs?:  number;
  readonly detail?:      string;
  readonly timestamp:    number;
}

export interface CRMetrics {
  readonly totalRegistered:    number;
  readonly totalRemoved:       number;
  readonly totalLookups:       number;
  readonly totalDiscoveries:   number;
  readonly totalErrors:        number;
  readonly avgQueryMs:         number;
}

export class CapabilityRegistryTelemetry {
  private readonly _events:  CRAuditEvent[] = [];
  private readonly _queryMs: number[]       = [];

  emit(event: CRAuditEvent): void {
    this._events.push(Object.freeze(event));
  }

  recordQuery(ms: number): void {
    this._queryMs.push(ms);
  }

  events(): readonly CRAuditEvent[] { return this._events; }

  ofType(type: CREventType): readonly CRAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  metrics(): Readonly<CRMetrics> {
    const cnt = (t: CREventType) => this._events.filter(e => e.type === t).length;
    const avg = this._queryMs.length > 0
      ? this._queryMs.reduce((a, b) => a + b, 0) / this._queryMs.length
      : 0;
    return Object.freeze({
      totalRegistered:  cnt("CapabilityRegistered"),
      totalRemoved:     cnt("CapabilityRemoved"),
      totalLookups:     cnt("CapabilityLookup"),
      totalDiscoveries: cnt("CapabilityDiscovery"),
      totalErrors:      cnt("DuplicateRegistrationRejected") + cnt("InvalidDescriptorRejected"),
      avgQueryMs:       parseFloat(avg.toFixed(2)),
    });
  }

  reset(): void {
    this._events.length = 0;
    this._queryMs.length = 0;
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────
const _KEY = "__CR_TELEMETRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilityRegistryTelemetry();
}
export const CRTelemetry: CapabilityRegistryTelemetry = (
  globalThis as unknown as Record<string, CapabilityRegistryTelemetry>
)[_KEY];