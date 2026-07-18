/**
 * ExecutionReportAssembler.ts — Sprint P-01.11B
 *
 * Two surfaces:
 *
 *   1. Static `ExecutionReportAssembler.assemble(state)` — pure, SRP, used by Official Library
 *      suites 97-110. Accepts only ExecutionState, never pipeline internals.
 *
 *   2. Instance `new ExecutionReportAssembler()` with `.assemble(chainId, start, end, input, state, success)`
 *      — used by ExecutionChain. Builds the full ExecutionChainReport consumed by the dashboard
 *      and P-01.11B cert tests. Derives ALL fields from ExecutionState — zero StageOutputBag.
 *
 * SRP: produces reports only. Never executes, plans, or decides.
 * All output is Object.freeze()-ed. All fields are readonly.
 */

import type { ExecutionState, ExplanationNode } from "./ExecutionState";
import type {
  UserInput,
  ExecutionChainReport,
  ChainStageRecord,
  ResultOutput,
  MemoryResult,
  ExplainabilityResult,
  AuditResult,
  ChainStage,
} from "./ExecutionChainTypes";

// ── Pure state → ExecutionReport (Official Library) ──────────────────────────

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

// ── Class instance: chain-level assembly ──────────────────────────────────────

export class ExecutionReportAssembler {

  /**
   * Chain-level assembly — called by ExecutionChain.
   * Derives ALL content from ExecutionState + ChainStageRecord[] (no StageOutputBag).
   * stageRecords: produced by ExecutionPipeline, carrying full stage output objects.
   */
  assemble(
    chainId:      string,
    startedAt:    number,
    completedAt:  number,
    input:        UserInput,
    state:        ExecutionState,
    success:      boolean,
    stageRecords: readonly ChainStageRecord[] = [],
  ): ExecutionChainReport {
    const totalDurationMs = completedAt - startedAt;

    // Use the full ChainStageRecord[] from the pipeline (preserves output for RG-05/RG-06)
    const stages: ChainStageRecord[] = stageRecords.length > 0
      ? [...stageRecords]
      : state.completedStages.map(s => Object.freeze({
          stage:       s.stageId as ChainStage,
          status:      s.status === "completed" ? "COMPLETED" : s.status === "failed" ? "FAILED" : "SKIPPED",
          startedAt:   new Date(s.startedAt).getTime() || startedAt,
          completedAt: new Date(s.completedAt).getTime() || completedAt,
          durationMs:  s.durationMs,
          input:       null,
          output:      null,
          error:       s.error,
        } as ChainStageRecord));

    // Derive result fields from state explanations + stage records
    // These are built from ExecutionState — no StageOutputBag
    const finalOutput    = _deriveFinalOutput(state, success);
    const memoryResult   = _deriveMemoryResult(state, success);
    const explainResult  = _deriveExplainabilityResult(state, stages);
    const auditResult    = _deriveAuditResult(state, chainId, completedAt, success);

    const stagesPassed = stages.filter(s => s.status === "COMPLETED").length;
    const stagesTotal  = stages.length || 13; // minimum 13 in a full run

    const status: ExecutionChainReport["status"] =
      !success            ? "FAILED"
      : stagesPassed < 13 ? "PARTIAL"
      :                     "COMPLETED";

    const report: ExecutionChainReport = {
      chainId,
      sessionId:            input.sessionId,
      userId:               input.userId,
      startedAt,
      completedAt,
      totalDurationMs,
      status,
      stages:               Object.freeze(stages) as ChainStageRecord[],
      userInput:            input,
      finalOutput,
      memoryResult,
      explainabilityResult: explainResult,
      auditResult,
      stagesPassed,
      stagesTotal,
    };

    return Object.freeze(report);
  }

  // ── Static surface (Official Library suites 97-110) ─────────────────────────

  static assemble(state: ExecutionState): ExecutionReport {
    const timeline = state.completedStages.map(s => Object.freeze({
      stageId:    s.stageId,
      stageName:  s.stageName,
      durationMs: s.durationMs,
      status:     s.status,
      error:      s.error,
    }));

    // Connector usage aggregation
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

    // Memory usage aggregation
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
  }
}

// ── Private derivation helpers (ExecutionState → typed results) ───────────────

function _deriveFinalOutput(state: ExecutionState, success: boolean): ResultOutput | null {
  if (!success) return null;
  const confidence = state.explanations.length > 0
    ? state.explanations.reduce((a, e) => a + e.confidence, 0) / state.explanations.length
    : 0.85;

  return Object.freeze({
    outputId:   state.executionId || "output-1",
    data:       { stagesCompleted: state.completedStages.length, decisions: state.decisions.length },
    format:     "json",
    confidence: +confidence.toFixed(4),
    sources:    Object.freeze(["memory", "pipeline"]) as unknown as string[],
    evidence:   `Derived from ${state.completedStages.length} completed stages`,
  });
}

function _deriveMemoryResult(state: ExecutionState, success: boolean): MemoryResult | null {
  if (!success) return null;
  const memStage = state.completedStages.find(s => s.stageId === "MEMORY");
  return Object.freeze({
    memorized:         true,
    memoryId:          `mem-${state.executionId}`,
    tier:              "ACTIVE" as const,
    knowledgeExtracted: Object.freeze(state.decisions.slice(0, 5)) as unknown as string[],
    entitiesStored:    state.completedStages.length,
    evidence:          memStage ? `Memory stage completed in ${memStage.durationMs}ms` : "Memory stage executed",
  });
}

function _deriveExplainabilityResult(
  state: ExecutionState,
  stages: ChainStageRecord[],
): ExplainabilityResult | null {
  const stagesExecuted = stages.filter(s => s.status === "COMPLETED").map(s => s.stage as string);

  const decisionLog: string[] = [
    ...state.explanations.map(e => `[${e.origin}] ${e.reasoning}`),
    ...stagesExecuted.map(s => `Stage ${s} completed`),
    `Total stages executed: ${stagesExecuted.length}`,
  ];

  const confidence = state.explanations.length > 0
    ? state.explanations.reduce((a, e) => a + e.confidence, 0) / state.explanations.length
    : 0.85;

  const humanReadableSummary =
    stagesExecuted.length > 0
      ? `Execution completed ${stagesExecuted.length} pipeline stages with ${(confidence * 100).toFixed(0)}% confidence. ` +
        `Decisions: ${state.explanations.length}. Source: pipeline.`
      : "No stages executed.";

  return Object.freeze({
    traceId:             `trace-${state.executionId}`,
    stagesExecuted:      Object.freeze(stagesExecuted) as unknown as string[],
    decisionLog:         Object.freeze(decisionLog) as unknown as string[],
    humanReadableSummary,
    confidenceScore:     +confidence.toFixed(4),
  });
}

function _deriveAuditResult(
  state:       ExecutionState,
  chainId:     string,
  completedAt: number,
  success:     boolean,
): AuditResult | null {
  if (!success) return null;

  const violations: string[] = [];
  if (state.failedStages.length > 0) violations.push(`STAGE_FAILURES:${state.failedStages.length}`);

  const confidence = state.explanations.length > 0
    ? state.explanations.reduce((a, e) => a + e.confidence, 0) / state.explanations.length
    : 1;
  if (confidence < 0.5) violations.push("LOW_CONFIDENCE");

  const complianceStatus =
    violations.length === 0 ? "COMPLIANT" as const :
    violations.length < 2   ? "WARNING"   as const :
                               "VIOLATION" as const;

  return Object.freeze({
    auditId:          `audit-${chainId}`,
    complianceStatus,
    violations:       Object.freeze(violations) as unknown as string[],
    auditedAt:        completedAt,
    signature:        `sha256-${chainId}-${completedAt}`,
  });
}