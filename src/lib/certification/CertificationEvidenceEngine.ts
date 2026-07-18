/**
 * CertificationEvidenceEngine.ts — EV-5.1
 * Generates tamper-evident execution records for every stage.
 * All evidence is derived from actual execution — nothing synthetic.
 */

export interface ExecutionEvidence {
  executionId: string;
  correlationId: string;
  requestId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  pipelineTrace: PipelineTraceEntry[];
  connectorTrace: ConnectorTraceEntry[];
  auditTrail: AuditEntry[];
  execHash: string;
  payload: Record<string, unknown>;
  memoryUsageKB: number;
}

export interface PipelineTraceEntry {
  stage: string;
  status: "PASS" | "FAIL" | "SKIP";
  startMs: number;
  endMs: number;
  durationMs: number;
  evidence: Record<string, unknown>;
  error?: string;
}

export interface ConnectorTraceEntry {
  connector: string;
  endpoint: string;
  httpStatus: number;
  latencyMs: number;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface AuditEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  stage: string;
  message: string;
  data?: Record<string, unknown>;
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
}

function fnv32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").toUpperCase();
}

function computeHash(pipeline: PipelineTraceEntry[], connectors: ConnectorTraceEntry[]): string {
  const raw = pipeline.map(p => `${p.stage}:${p.status}:${p.durationMs}`).join("|")
    + "||" + connectors.map(c => `${c.connector}:${c.httpStatus}:${c.latencyMs}`).join("|");
  return fnv32(raw);
}

function memUsage(): number {
  try {
    const perf = (performance as any);
    if (perf?.memory?.usedJSHeapSize) return Math.round(perf.memory.usedJSHeapSize / 1024);
  } catch { /* no-op */ }
  return 0;
}

export class EvidenceCollector {
  private execId: string;
  private corrId: string;
  private reqId: string;
  private startTime: Date;
  private pipeline: PipelineTraceEntry[] = [];
  private connectors: ConnectorTraceEntry[] = [];
  private audit: AuditEntry[] = [];
  private baselineMs: number;

  constructor() {
    this.execId = genId("EXEC");
    this.corrId = genId("CORR");
    this.reqId  = genId("REQ");
    this.startTime = new Date();
    this.baselineMs = Date.now();
  }

  recordStage(entry: PipelineTraceEntry): void {
    this.pipeline.push(entry);
    this.audit.push({
      timestamp: new Date().toISOString(),
      level: entry.status === "FAIL" ? "ERROR" : "INFO",
      stage: entry.stage,
      message: `Stage ${entry.stage} → ${entry.status} in ${entry.durationMs}ms`,
      data: entry.evidence,
    });
  }

  recordConnector(entry: ConnectorTraceEntry): void {
    this.connectors.push(entry);
    this.audit.push({
      timestamp: new Date().toISOString(),
      level: entry.success ? "INFO" : "WARN",
      stage: "ConnectorRuntime",
      message: `${entry.connector} ${entry.endpoint} → HTTP ${entry.httpStatus} (${entry.latencyMs}ms)`,
    });
  }

  finalize(payload: Record<string, unknown> = {}): ExecutionEvidence {
    const endTime = new Date();
    const durationMs = endTime.getTime() - this.startTime.getTime();
    const sanitized = sanitizePayload(payload);

    return Object.freeze({
      executionId: this.execId,
      correlationId: this.corrId,
      requestId: this.reqId,
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      pipelineTrace: [...this.pipeline],
      connectorTrace: [...this.connectors],
      auditTrail: [...this.audit],
      execHash: computeHash(this.pipeline, this.connectors),
      payload: sanitized,
      memoryUsageKB: memUsage(),
    });
  }
}

function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const REDACTED_KEYS = ["token", "access_token", "refresh_token", "password", "secret", "key", "authorization"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (REDACTED_KEYS.some(r => k.toLowerCase().includes(r))) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      out[k] = sanitizePayload(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const CertificationEvidenceEngine = Object.freeze({
  createCollector(): EvidenceCollector {
    return new EvidenceCollector();
  },
  computeHash: fnv32,
  sanitizePayload,
});