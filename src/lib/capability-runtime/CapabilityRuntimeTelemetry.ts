/**
 * CapabilityRuntimeTelemetry.ts — Sprint C-03.6.3
 * Auditoria e métricas do Capability Runtime.
 *
 * Eventos obrigatórios:
 *   CapabilityExecutionCreated | Started | Running | Completed
 *   CapabilityExecutionCancelled | Failed | Timeout | CapabilityRetryScheduled
 */

export type CRTEventType =
  | "CapabilityExecutionCreated"
  | "CapabilityExecutionStarted"
  | "CapabilityExecutionRunning"
  | "CapabilityExecutionCompleted"
  | "CapabilityExecutionCancelled"
  | "CapabilityExecutionFailed"
  | "CapabilityExecutionTimeout"
  | "CapabilityRetryScheduled";

export interface CRTAuditEvent {
  readonly type:          CRTEventType;
  readonly executionId:   string;
  readonly capabilityId?: string;
  readonly state?:        string;
  readonly durationMs?:   number;
  readonly retryCount?:   number;
  readonly detail?:       string;
  readonly timestamp:     number;
}

export interface CRTMetrics {
  readonly totalCreated:    number;
  readonly totalStarted:    number;
  readonly totalCompleted:  number;
  readonly totalFailed:     number;
  readonly totalCancelled:  number;
  readonly totalTimeout:    number;
  readonly totalRetries:    number;
  readonly avgDurationMs:   number;
}

export class CapabilityRuntimeTelemetry {
  private readonly _events:    CRTAuditEvent[] = [];
  private readonly _durations: number[]         = [];

  emit(event: CRTAuditEvent): void {
    this._events.push(Object.freeze(event));
  }

  recordDuration(ms: number): void {
    this._durations.push(ms);
  }

  events(): readonly CRTAuditEvent[] { return this._events; }

  ofType(type: CRTEventType): readonly CRTAuditEvent[] {
    return this._events.filter(e => e.type === type);
  }

  forExecution(id: string): readonly CRTAuditEvent[] {
    return this._events.filter(e => e.executionId === id);
  }

  metrics(): Readonly<CRTMetrics> {
    const c = (t: CRTEventType) => this._events.filter(e => e.type === t).length;
    const avg = this._durations.length > 0
      ? this._durations.reduce((a, b) => a + b, 0) / this._durations.length
      : 0;
    return Object.freeze({
      totalCreated:   c("CapabilityExecutionCreated"),
      totalStarted:   c("CapabilityExecutionStarted"),
      totalCompleted: c("CapabilityExecutionCompleted"),
      totalFailed:    c("CapabilityExecutionFailed"),
      totalCancelled: c("CapabilityExecutionCancelled"),
      totalTimeout:   c("CapabilityExecutionTimeout"),
      totalRetries:   c("CapabilityRetryScheduled"),
      avgDurationMs:  parseFloat(avg.toFixed(2)),
    });
  }

  reset(): void {
    this._events.length = 0;
    this._durations.length = 0;
  }
}