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
  "engineering.runtime.investigate",
  "engineering.runtime.compare",
  "engineering.runtime.bottlenecks",
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
function toMs(v: unknown): number {
  const n = typeof v === "number" ? v : Date.parse(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}
function summarizeObservation(o: any) {
  return {
    executionId: o.execution_id,
    stepId: o.step_id ?? null,
    connector: o.connector,
    capability: o.capability,
    toolName: o.tool_name ?? null,
    status: o.status,
    durationMs: o.duration_ms ?? null,
    errorSignature: o.error_signature ?? null,
    error: o.error_message ?? null,
    startedAt: o.started_at ?? null,
    finishedAt: o.finished_at ?? null,
    goalType: o.goal_type ?? null,
  };
}
function phaseName(o: any): string | null {
  if (o.connector === "supervised-write-phase" || o.connector === "openhands-phase") {
    return typeof o.capability === "string" ? o.capability : null;
  }
  return null;
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
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

      if (operation === "engineering.runtime.investigate") {
        const recent = await base44.entities.ExecutionObservation.filter({}, "-created_date", Math.max(limit, 500));
        let target = targetExecutionId
          ? recent.find((o: any) => o.execution_id === targetExecutionId)
          : recent.find((o: any) => ["failed", "timeout", "blocked"].includes(o.status));
        if (!target) return fail("No target execution found", start, eid, logs, operation);

        const center = toMs(target.started_at || target.created_date);
        const windowMs = n(payload.windowMs ?? payload.window_ms, 600_000, 30_000, 3_600_000);
        const related = recent
          .filter((o: any) => {
            const ts = toMs(o.started_at || o.created_date);
            return ts > 0 && Math.abs(ts - center) <= windowMs;
          })
          .filter((o: any) =>
            o.execution_id === target.execution_id ||
            ["adaptive-process", "mcp", "openhands", "openhands-phase", "supervised-write-phase"].includes(o.connector) ||
            o.goal_type === "supervisedEngineering"
          )
          .sort((a: any, b: any) => toMs(a.started_at || a.created_date) - toMs(b.started_at || b.created_date));

        const phases = related
          .map((o: any) => ({ phase: phaseName(o), ...summarizeObservation(o) }))
          .filter((x: any) => x.phase);
        const expected = ["approval1", "write_plan", "baseline_dispatch", "before_openhands_dispatch", "write_start", "write_start_poll", "bootstrap_poll", "write_continue", "write_poll"];
        const seen = new Set(phases.map((p: any) => p.phase));
        const missingExpectedPhases = expected.filter((p) => !seen.has(p));
        const lastPhase = phases.length ? phases[phases.length - 1] : null;
        let diagnosis = "insufficient_phase_evidence";
        if (lastPhase?.status === "failed" || lastPhase?.status === "timeout") diagnosis = `failure_at_${lastPhase.phase}`;
        else if (seen.has("baseline_dispatch") && !seen.has("before_openhands_dispatch")) diagnosis = "stalled_after_baseline_before_openhands_dispatch";
        else if (seen.has("before_openhands_dispatch") && !seen.has("write_start")) diagnosis = "stalled_entering_openhands_connector";
        else if (seen.has("write_start") && !seen.has("write_start_poll")) diagnosis = "stalled_in_write_start";
        else if (seen.has("write_continue") && !seen.has("write_poll")) diagnosis = "stalled_after_write_continue";

        return ok({
          target: summarizeObservation(target),
          diagnosis,
          lastPhase,
          missingExpectedPhases,
          phases,
          related: related.map(summarizeObservation),
          windowMs,
        }, start, eid, logs, operation);
      }

      if (operation === "engineering.runtime.compare") {
        const aId = str(payload.executionIdA ?? payload.execution_id_a ?? payload.executionId ?? payload.execution_id);
        const bId = str(payload.executionIdB ?? payload.execution_id_b);
        if (!aId || !bId) return fail("executionIdA and executionIdB are required", start, eid, logs, operation);
        const recent = await base44.entities.ExecutionObservation.filter({}, "-created_date", Math.max(limit, 1000));
        const build = (id: string) => {
          const target = recent.find((o: any) => o.execution_id === id);
          if (!target) return null;
          const center = toMs(target.started_at || target.created_date);
          const related = recent.filter((o: any) => Math.abs(toMs(o.started_at || o.created_date) - center) <= 600_000)
            .filter((o: any) => o.execution_id === id || ["openhands-phase", "supervised-write-phase"].includes(o.connector))
            .sort((x: any, y: any) => toMs(x.started_at || x.created_date) - toMs(y.started_at || y.created_date));
          return { target: summarizeObservation(target), phases: related.map((o: any) => ({ phase: phaseName(o), ...summarizeObservation(o) })).filter((x: any) => x.phase) };
        };
        const a = build(aId); const b = build(bId);
        if (!a || !b) return fail("One or both executions were not found", start, eid, logs, operation);
        const aNames = a.phases.map((p: any) => p.phase);
        const bNames = b.phases.map((p: any) => p.phase);
        return ok({
          executionA: a,
          executionB: b,
          onlyInA: aNames.filter((p: string) => !bNames.includes(p)),
          onlyInB: bNames.filter((p: string) => !aNames.includes(p)),
          samePhaseSequence: JSON.stringify(aNames) === JSON.stringify(bNames),
        }, start, eid, logs, operation);
      }

      if (operation === "engineering.runtime.bottlenecks") {
        const rows = await base44.entities.ExecutionObservation.filter({}, "-created_date", limit);
        const groups = new Map<string, any[]>();
        for (const row of rows) {
          const key = `${row.connector ?? "unknown"}::${row.capability ?? "unknown"}`;
          const arr = groups.get(key) ?? [];
          arr.push(row);
          groups.set(key, arr);
        }
        const bottlenecks = [...groups.entries()].map(([key, items]) => {
          const durations = items.map((x: any) => Number(x.duration_ms) || 0);
          const failures = items.filter((x: any) => ["failed", "timeout", "blocked"].includes(x.status)).length;
          const timeouts = items.filter((x: any) => x.status === "timeout" || /timeout/i.test(String(x.error_message ?? ""))).length;
          return {
            key,
            connector: items[0]?.connector ?? null,
            capability: items[0]?.capability ?? null,
            count: items.length,
            failures,
            timeouts,
            failureRate: items.length ? failures / items.length : 0,
            avgDurationMs: durations.length ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0,
            p95DurationMs: percentile(durations, 0.95),
            maxDurationMs: durations.length ? Math.max(...durations) : 0,
          };
        }).sort((a, b) => (b.failureRate - a.failureRate) || (b.p95DurationMs - a.p95DurationMs));
        return ok({ sampleSize: rows.length, bottlenecks }, start, eid, logs, operation);
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
