/**
 * RuntimeObservabilityConnector.ts
 * Read-only observability capabilities over existing durable telemetry.
 * Reuses ExecutionObservation, SystemEvent and HealthMonitor; no new engine.
 */
import type { IConnector } from "../IConnector";
import type { ConnectorContext, ConnectorHealthReport, ConnectorMetadata, ConnectorResult, ConnectorLog } from "../ConnectorTypes";
import { makeExecutionId, makeLog } from "../ConnectorTypes";
import { base44 } from "@/api/base44Client";
import { HealthMonitor } from "@/lib/operational-intelligence/HealthMonitor";

const CAPABILITIES = Object.freeze([
  "engineering.runtime.trace",
  "engineering.runtime.logs",
  "engineering.runtime.errors",
  "engineering.runtime.metrics",
]);

function ok<T>(data: T, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult<T> {
  const duration = Date.now() - start;
  logs.push(makeLog("info", `[${op}] Completed in ${duration}ms`));
  return { status: "SUCCESS", success: true, data, duration, connectorId: "runtime-observability", executionId: eid, logs };
}
function fail(error: string, start: number, eid: string, logs: ConnectorLog[], op: string): ConnectorResult {
  const duration = Date.now() - start;
  logs.push(makeLog("error", `[${op}] FAILED - ${error}`));
  return { status: "FAILED", success: false, error, duration, connectorId: "runtime-observability", executionId: eid, logs };
}
function n(v: unknown, fallback: number, min: number, max: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.floor(x))) : fallback;
}
function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function parsePayload(v: unknown): unknown {
  if (typeof v !== "string" || !v) return v ?? null;
  try { return JSON.parse(v); } catch { return v; }
}

export class RuntimeObservabilityConnector implements IConnector {
  readonly id = "runtime-observability";

  metadata(): ConnectorMetadata {
    return {
      id: this.id,
      name: "Runtime Observability",
      version: "1.0.0",
      description: "Read-only runtime traces, logs, errors and metrics from MemoryOS durable telemetry.",
      author: "MemoryOS",
      capabilities: [...CAPABILITIES],
      capabilityReversibility: Object.fromEntries(CAPABILITIES.map((c) => [c, "safe"])) as Record<string, "safe">,
    };
  }
  validate(): boolean { return true; }
  async initialize(_ctx: ConnectorContext): Promise<void> {}
  async shutdown(): Promise<void> {}
  async health(): Promise<ConnectorHealthReport> {
    return { status: "healthy", connectorId: this.id, checkedAt: Date.now(), details: "Read-only telemetry connector ready." };
  }

  async execute(operation: string, payload: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorResult> {
    const start = Date.now();
    const eid = context.executionId || makeExecutionId();
    const logs: ConnectorLog[] = [makeLog("info", `[${operation}] executionId=${eid}`)];
    try {
      if (!CAPABILITIES.includes(operation as any)) return fail(`Unknown operation: ${operation}`, start, eid, logs, operation);
      const limit = n(payload.limit, 200, 1, 1000);
      const targetExecutionId = str(payload.executionId ?? payload.execution_id);

      if (operation === "engineering.runtime.trace") {
        if (!targetExecutionId) return fail("executionId is required", start, eid, logs, operation);
        const observations = await base44.entities.ExecutionObservation.filter({ execution_id: targetExecutionId }, "created_date", limit);
        const events = await base44.entities.SystemEvent.filter({ correlationId: targetExecutionId }, "created_date", limit);
        const steps = observations.map((o: any) => ({
          kind: "execution", executionId: o.execution_id, stepId: o.step_id ?? null,
          connector: o.connector, capability: o.capability, toolName: o.tool_name ?? null,
          server: o.server ?? null, status: o.status, durationMs: o.duration_ms ?? null,
          errorSignature: o.error_signature ?? null, error: o.error_message ?? null,
          startedAt: o.started_at ?? null, finishedAt: o.finished_at ?? null,
          payload: parsePayload(o.payload), semaphoreWaitMs: o.semaphore_wait_ms ?? 0,
        }));
        const system = events.map((e: any) => ({
          kind: "system", type: e.type, source: e.source, status: e.status ?? null,
          actor: e.actor ?? null, payload: e.payload ?? null, metadata: e.metadata ?? null,
          createdAt: e.created_date ?? null,
        }));
        return ok({ executionId: targetExecutionId, observations: steps, systemEvents: system, counts: { observations: steps.length, systemEvents: system.length } }, start, eid, logs, operation);
      }

      if (operation === "engineering.runtime.logs") {
        const query: Record<string, unknown> = {};
        if (targetExecutionId) query.correlationId = targetExecutionId;
        const sessionId = str(payload.sessionId ?? payload.session_id);
        if (sessionId) query.conversationId = sessionId;
        const rows = await base44.entities.SystemEvent.filter(query, "-created_date", limit);
        const source = str(payload.source);
        const status = str(payload.status);
        const filtered = rows.filter((e: any) => (!source || e.source === source) && (!status || e.status === status));
        return ok({ count: filtered.length, logs: filtered }, start, eid, logs, operation);
      }

      if (operation === "engineering.runtime.errors") {
        const query: Record<string, unknown> = {};
        if (targetExecutionId) query.execution_id = targetExecutionId;
        const rows = await base44.entities.ExecutionObservation.filter(query, "-created_date", limit);
        const failures = rows.filter((o: any) => ["failed", "timeout", "blocked"].includes(o.status));
        return ok({ count: failures.length, errors: failures.map((o: any) => ({
          executionId: o.execution_id, stepId: o.step_id ?? null, connector: o.connector,
          capability: o.capability, toolName: o.tool_name ?? null, status: o.status,
          errorSignature: o.error_signature ?? null, error: o.error_message ?? null,
          durationMs: o.duration_ms ?? null, startedAt: o.started_at ?? null, finishedAt: o.finished_at ?? null,
          payload: parsePayload(o.payload),
        })) }, start, eid, logs, operation);
      }

      const snapshot = await HealthMonitor.snapshot(limit);
      const rows = await base44.entities.ExecutionObservation.filter({}, "-created_date", limit);
      const durations = rows.map((o: any) => Number(o.duration_ms) || 0).filter((x: number) => x >= 0).sort((a: number, b: number) => a - b);
      const avgDurationMs = durations.length ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;
      const p95DurationMs = durations.length ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] : 0;
      return ok({ ...snapshot, avgDurationMs, p95DurationMs, sampleSize: rows.length }, start, eid, logs, operation);
    } catch (e: any) {
      return fail(e?.message ?? String(e), start, eid, logs, operation);
    }
  }
}
