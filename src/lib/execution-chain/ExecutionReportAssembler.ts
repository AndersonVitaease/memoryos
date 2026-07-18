/**
 * ExecutionReportAssembler.ts — Sprint P-01.11B
 *
 * SRP: produces ExecutionReport from ExecutionState. Never executes. Never plans. Never decides.
 * All output fields are readonly. Report is Object.freeze()-ed.
 */

import type { ExecutionState, ExplanationNode } from "./ExecutionState";

export interface StageReportEntry {
  readonly stageId:    string;
  readonly stageName:  string;
  readonly durationMs: number;
  readonly status:     string;
  readonly error:      string | null;
}

export interface ConnectorUsageSummary {
  readonly connectorId:   string;
  readonly callCount:     number;
  readonly totalMs:       number;
  readonly successCount:  number;
  readonly failureCount:  number;
  readonly avgMs:         number;
}

export interface MemoryUsageSummary {
  readonly providerId:    string;
  readonly queryCount:    number;
  readonly totalMs:       number;
  readonly totalResults:  number;
}

export interface ExecutionReport {
  readonly executionId:       string;
  readonly goalId:            string;
  readonly pipelineId:        string;
  readonly status:            string;
  readonly timeline:          readonly StageReportEntry[];
  readonly connectorUsage:    readonly ConnectorUsageSummary[];
  readonly memoryUsage:       readonly MemoryUsageSummary[];
  readonly decisions:         readonly string[];
  readonly explanations:      readonly ExplanationNode[];
  readonly confidence:        number;
  readonly explanation:       string;
  readonly durationMs:        number;
  readonly diagnostics:       readonly string[];
  readonly generatedAt:       string;
}

export const ExecutionReportAssembler = {

  assemble(state: ExecutionState): ExecutionReport {
    const timeline = state.completedStages.map(s => Object.freeze({
      stageId:    s.stageId,
      stageName:  s.stageName,
      durationMs: s.durationMs,
      status:     s.status,
      error:      s.error,
    }));

    // Aggregate connector usage
    const connMap = new Map<string, { calls: number; ms: number; ok: number; fail: number }>();
    for (const c of state.connectorCalls) {
      const e = connMap.get(c.connectorId) ?? { calls: 0, ms: 0, ok: 0, fail: 0 };
      connMap.set(c.connectorId, {
        calls: e.calls + 1,
        ms:    e.ms + c.durationMs,
        ok:    e.ok + (c.success ? 1 : 0),
        fail:  e.fail + (c.success ? 0 : 1),
      });
    }
    const connectorUsage = [...connMap.entries()].map(([id, v]) =>
      Object.freeze({
        connectorId:  id,
        callCount:    v.calls,
        totalMs:      v.ms,
        successCount: v.ok,
        failureCount: v.fail,
        avgMs:        v.calls > 0 ? +(v.ms / v.calls).toFixed(2) : 0,
      })
    );

    // Aggregate memory usage
    const memMap = new Map<string, { queries: number; ms: number; results: number }>();
    for (const m of state.memoryQueries) {
      const e = memMap.get(m.providerId) ?? { queries: 0, ms: 0, results: 0 };
      memMap.set(m.providerId, {
        queries: e.queries + 1,
        ms:      e.ms + m.durationMs,
        results: e.results + m.resultCount,
      });
    }
    const memoryUsage = [...memMap.entries()].map(([id, v]) =>
      Object.freeze({
        providerId:   id,
        queryCount:   v.queries,
        totalMs:      v.ms,
        totalResults: v.results,
      })
    );

    // Diagnostics
    const diagnostics: string[] = [];
    if (state.failedStages.length > 0)
      diagnostics.push(`${state.failedStages.length} stage(s) failed`);
    if (state.pendingStages.length > 0)
      diagnostics.push(`${state.pendingStages.length} stage(s) never executed`);
    const slowStages = state.completedStages.filter(s => s.durationMs > 500);
    if (slowStages.length > 0)
      diagnostics.push(`${slowStages.length} slow stage(s) (>500ms): ${slowStages.map(s => s.stageId).join(", ")}`);

    const avgConf = state.explanations.length > 0
      ? state.explanations.reduce((a, e) => a + e.confidence, 0) / state.explanations.length
      : 0;

    const explanation = state.explanations.length > 0
      ? state.explanations[state.explanations.length - 1]?.reasoning ?? "No explanation produced"
      : "No explanations recorded";

    const report: ExecutionReport = {
      executionId:    state.executionId,
      goalId:         state.goalId,
      pipelineId:     state.pipelineId,
      status:         state.status,
      timeline:       Object.freeze(timeline),
      connectorUsage: Object.freeze(connectorUsage),
      memoryUsage:    Object.freeze(memoryUsage),
      decisions:      Object.freeze([...state.decisions]),
      explanations:   Object.freeze([...state.explanations]),
      confidence:     +avgConf.toFixed(4),
      explanation,
      durationMs:     state.telemetry.totalDurationMs,
      diagnostics:    Object.freeze(diagnostics),
      generatedAt:    new Date().toISOString(),
    };

    return Object.freeze(report);
  },
};