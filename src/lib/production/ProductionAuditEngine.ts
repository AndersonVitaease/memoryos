// ProductionAuditEngine.ts — Sprint EF-35
// Immutable operational audit log: every event is frozen on creation

export type AuditEventType =
  | "Deploy" | "Restart" | "Crash" | "Recovery"
  | "ConnectorFailure" | "PipelineFailure" | "AuthFailure"
  | "ConfigChange" | "CertificateValidation" | "AlertRaised"
  | "RecoveryAttempt" | "RecoverySuccess" | "RecoveryFailed"
  | "HealthCheck" | "MetricsSnapshot";

export interface AuditEvent {
  readonly id: string;
  readonly type: AuditEventType;
  readonly timestamp: number;
  readonly component: string;
  readonly detail: string;
  readonly correlationId: string;
  readonly executionId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
}

const _log: AuditEvent[] = [];
let _seq = 0;

function immutable<T extends object>(obj: T): Readonly<T> {
  return Object.freeze({ ...obj });
}

export const ProductionAuditEngine = {
  record(
    type: AuditEventType,
    component: string,
    detail: string,
    metadata: Record<string, unknown> = {},
    severity: AuditEvent["severity"] = "INFO",
  ): AuditEvent {
    const event: AuditEvent = immutable({
      id:            `AUD-${Date.now()}-${++_seq}`,
      type,
      timestamp:     Date.now(),
      component,
      detail,
      correlationId: `CORR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      executionId:   `EXEC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      metadata:      Object.freeze({ ...metadata }),
      severity,
    });
    _log.unshift(event);
    if (_log.length > 1000) _log.splice(1000);
    return event;
  },

  // Convenience recorders
  deploy(detail: string, meta?: Record<string, unknown>) {
    return ProductionAuditEngine.record("Deploy", "platform", detail, meta);
  },
  crash(component: string, error: string) {
    return ProductionAuditEngine.record("Crash", component, error, { error }, "CRITICAL");
  },
  recovery(component: string, detail: string) {
    return ProductionAuditEngine.record("Recovery", component, detail, {}, "INFO");
  },
  connectorFailure(name: string, error: string) {
    return ProductionAuditEngine.record("ConnectorFailure", name, error, { connector: name, error }, "ERROR");
  },
  pipelineFailure(stage: string, error: string) {
    return ProductionAuditEngine.record("PipelineFailure", stage, error, { stage, error }, "ERROR");
  },
  authFailure(component: string, detail: string) {
    return ProductionAuditEngine.record("AuthFailure", component, detail, {}, "ERROR");
  },
  configChange(key: string, detail: string) {
    return ProductionAuditEngine.record("ConfigChange", key, detail, { key }, "WARNING");
  },
  certValidation(certId: string, status: string) {
    return ProductionAuditEngine.record("CertificateValidation", "certification", `${certId} — ${status}`, { certId, status });
  },
  healthCheck(status: string, components: number) {
    return ProductionAuditEngine.record("HealthCheck", "health-engine", `status=${status} components=${components}`, { status, components });
  },

  getAll(): AuditEvent[] { return [..._log]; },
  getByType(t: AuditEventType): AuditEvent[] { return _log.filter(e => e.type === t); },
  getBySeverity(s: AuditEvent["severity"]): AuditEvent[] { return _log.filter(e => e.severity === s); },
  getRecent(n = 50): AuditEvent[] { return _log.slice(0, n); },
  count(): number { return _log.length; },
};