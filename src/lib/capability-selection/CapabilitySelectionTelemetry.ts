/**
 * CapabilitySelectionTelemetry.ts — Sprint C-03.6
 * Auditoria e métricas do Capability Selection Engine.
 *
 * Eventos obrigatórios:
 *   CapabilitySelectionStarted
 *   CapabilitiesLoaded
 *   CapabilitiesFiltered
 *   CapabilityRanked
 *   CapabilitySelected
 *   CapabilitySelectionCompleted
 */

export type CSEventType =
  | "CapabilitySelectionStarted"
  | "CapabilitiesLoaded"
  | "CapabilitiesFiltered"
  | "CapabilityRanked"
  | "CapabilitySelected"
  | "CapabilitySelectionCompleted"
  | "CapabilitySelectionFailed";

export interface CSAuditEvent {
  readonly type:          CSEventType;
  readonly goalId:        string;
  readonly goalType:      string;
  readonly detail?:       string;
  readonly count?:        number;
  readonly capabilityId?: string;
  readonly score?:        number;
  readonly durationMs?:   number;
  readonly timestamp:     number;
}

export interface CSMetrics {
  readonly totalSelections:     number;
  readonly successfulSelections: number;
  readonly failedSelections:    number;
  readonly avgDurationMs:       number;
  readonly successRate:         string;
}

export class CapabilitySelectionTelemetry {
  private readonly _events: CSAuditEvent[] = [];
  private readonly _durations: number[] = [];

  emit(event: CSAuditEvent): void {
    this._events.push(Object.freeze(event));
  }

  recordDuration(ms: number): void {
    this._durations.push(ms);
  }

  events(): readonly CSAuditEvent[] {
    return this._events;
  }

  ofType(type: CSEventType): readonly CSAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  metrics(): Readonly<CSMetrics> {
    const total   = this.ofType("CapabilitySelectionCompleted").length;
    const failed  = this.ofType("CapabilitySelectionFailed").length;
    const success = total - failed;
    const avg     = this._durations.length > 0
      ? this._durations.reduce((a, b) => a + b, 0) / this._durations.length
      : 0;
    return Object.freeze({
      totalSelections:      total,
      successfulSelections: success,
      failedSelections:     failed,
      avgDurationMs:        parseFloat(avg.toFixed(2)),
      successRate:          total > 0 ? `${Math.round(success / total * 100)}%` : "0%",
    });
  }

  reset(): void {
    this._events.length = 0;
    this._durations.length = 0;
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────
const _KEY = "__CSE_TELEMETRY__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CapabilitySelectionTelemetry();
}
export const CSETelemetry: CapabilitySelectionTelemetry = (
  globalThis as unknown as Record<string, CapabilitySelectionTelemetry>
)[_KEY];