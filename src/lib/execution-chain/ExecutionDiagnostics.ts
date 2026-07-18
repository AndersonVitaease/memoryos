/**
 * ExecutionDiagnostics.ts — Sprint P-01.11B
 *
 * SRP: diagnostics only — no execution, no planning, no decisions.
 * Receives ExecutionState and produces structured diagnostic data.
 */

import type { ExecutionState, StageRecord } from "./ExecutionState";

export interface StageDiagnostic {
  readonly stageId:    string;
  readonly durationMs: number;
  readonly status:     string;
  readonly isSlow:     boolean;
  readonly isFailed:   boolean;
}

export interface ConnectorDiagnostic {
  readonly connectorId: string;
  readonly callCount:   number;
  readonly avgLatencyMs: number;
  readonly failureRate: number;
  readonly isBottleneck: boolean;
}

export interface MemoryDiagnostic {
  readonly providerId:  string;
  readonly queryCount:  number;
  readonly avgLatencyMs: number;
  readonly isBottleneck: boolean;
}

export interface ExecutionDiagnosticReport {
  readonly executionId:       string;
  readonly totalDurationMs:   number;
  readonly stageCount:        number;
  readonly slowStages:        readonly StageDiagnostic[];
  readonly failedStages:      readonly StageDiagnostic[];
  readonly connectorDiagnostics: readonly ConnectorDiagnostic[];
  readonly memoryDiagnostics:    readonly MemoryDiagnostic[];
  readonly bottlenecks:       readonly string[];
  readonly retryCount:        number;
  readonly overallHealth:     "healthy" | "degraded" | "critical";
  readonly recommendations:   readonly string[];
  readonly timeline:          readonly StageDiagnostic[];
  readonly generatedAt:       string;
}

const SLOW_STAGE_THRESHOLD_MS = 500;
const BOTTLENECK_LATENCY_MS   = 300;

export const ExecutionDiagnostics = {

  analyze(state: ExecutionState): ExecutionDiagnosticReport {
    const allStages: StageDiagnostic[] = state.completedStages.map(s => Object.freeze({
      stageId:    s.stageId,
      durationMs: s.durationMs,
      status:     s.status,
      isSlow:     s.durationMs > SLOW_STAGE_THRESHOLD_MS,
      isFailed:   s.status === "failed",
    }));

    const failedStageDiags: StageDiagnostic[] = state.failedStages.map(s => Object.freeze({
      stageId:    s.stageId,
      durationMs: s.durationMs,
      status:     "failed",
      isSlow:     s.durationMs > SLOW_STAGE_THRESHOLD_MS,
      isFailed:   true,
    }));

    const slowStages = allStages.filter(s => s.isSlow);

    // Connector diagnostics
    const connMap = new Map<string, { total: number; ms: number; fail: number }>();
    for (const c of state.connectorCalls) {
      const e = connMap.get(c.connectorId) ?? { total: 0, ms: 0, fail: 0 };
      connMap.set(c.connectorId, {
        total: e.total + 1,
        ms:    e.ms + c.durationMs,
        fail:  e.fail + (c.success ? 0 : 1),
      });
    }
    const connectorDiagnostics = [...connMap.entries()].map(([id, v]) => {
      const avg = v.total > 0 ? v.ms / v.total : 0;
      return Object.freeze({
        connectorId:   id,
        callCount:     v.total,
        avgLatencyMs:  +avg.toFixed(2),
        failureRate:   v.total > 0 ? +(v.fail / v.total).toFixed(3) : 0,
        isBottleneck:  avg > BOTTLENECK_LATENCY_MS,
      });
    });

    // Memory diagnostics
    const memMap = new Map<string, { total: number; ms: number }>();
    for (const m of state.memoryQueries) {
      const e = memMap.get(m.providerId) ?? { total: 0, ms: 0 };
      memMap.set(m.providerId, { total: e.total + 1, ms: e.ms + m.durationMs });
    }
    const memoryDiagnostics = [...memMap.entries()].map(([id, v]) => {
      const avg = v.total > 0 ? v.ms / v.total : 0;
      return Object.freeze({
        providerId:    id,
        queryCount:    v.total,
        avgLatencyMs:  +avg.toFixed(2),
        isBottleneck:  avg > BOTTLENECK_LATENCY_MS,
      });
    });

    const bottlenecks: string[] = [
      ...connectorDiagnostics.filter(c => c.isBottleneck).map(c => `connector:${c.connectorId}`),
      ...memoryDiagnostics.filter(m => m.isBottleneck).map(m => `memory:${m.providerId}`),
      ...slowStages.map(s => `stage:${s.stageId}`),
    ];

    const recommendations: string[] = [];
    if (slowStages.length > 0) recommendations.push(`Optimize ${slowStages.length} slow stage(s)`);
    if (failedStageDiags.length > 0) recommendations.push(`Investigate ${failedStageDiags.length} failed stage(s)`);
    if (connectorDiagnostics.some(c => c.failureRate > 0.1)) recommendations.push("High connector failure rate detected — check auth/network");
    if (memoryDiagnostics.some(m => m.isBottleneck)) recommendations.push("Memory provider latency high — consider caching");

    const overallHealth: ExecutionDiagnosticReport["overallHealth"] =
      failedStageDiags.length > 0 ? "critical"
      : bottlenecks.length > 2    ? "degraded"
      : "healthy";

    return Object.freeze({
      executionId:          state.executionId,
      totalDurationMs:      state.telemetry.totalDurationMs,
      stageCount:           state.telemetry.stageCount,
      slowStages:           Object.freeze(slowStages),
      failedStages:         Object.freeze(failedStageDiags),
      connectorDiagnostics: Object.freeze(connectorDiagnostics),
      memoryDiagnostics:    Object.freeze(memoryDiagnostics),
      bottlenecks:          Object.freeze(bottlenecks),
      retryCount:           state.telemetry.retryCount,
      overallHealth,
      recommendations:      Object.freeze(recommendations),
      timeline:             Object.freeze(allStages),
      generatedAt:          new Date().toISOString(),
    });
  },
};