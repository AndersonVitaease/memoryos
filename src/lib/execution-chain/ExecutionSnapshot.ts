// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-08/EF-19: ExecutionSnapshot + SnapshotAssembler
//
// EF-19: Dashboard consumes ONLY ExecutionSnapshot — no internal types exposed.
//        ExecutionSnapshotAssembler is the sole converter from ExecutionChainReport.
// ══════════════════════════════════════════════════════════════════════════════

import type { ExecutionChainReport } from "./ExecutionChainTypes";

/** Public-facing stage summary — no internal types, plain scalars only. */
export interface StageSnapshot {
  readonly stage:      string;
  readonly status:     "COMPLETED" | "FAILED" | "PENDING";
  readonly durationMs: number;
  readonly summary:    string;
}

/**
 * ExecutionSnapshot — the ONLY shape that Dashboard and external consumers may use.
 * No ExecutionChainReport, no StageOutputBag, no runtime internals.
 */
export interface ExecutionSnapshot {
  readonly executionId:     string;
  readonly sessionId:       string;
  readonly status:          "COMPLETED" | "FAILED" | "PARTIAL";
  readonly startedAt:       number;
  readonly completedAt:     number;
  readonly totalDurationMs: number;
  readonly stagesPassed:    number;
  readonly stagesTotal:     number;
  readonly stages:          readonly StageSnapshot[];

  // Aggregate results — plain scalars only, no internal types
  readonly compliance:    "COMPLIANT" | "WARNING" | "VIOLATION" | null;
  readonly confidence:    number | null;
  readonly memorized:     boolean | null;
  readonly connectorUsed: string | null;
  readonly intentType:    string | null;
  readonly humanSummary:  string | null;
}

/**
 * EF-19: ExecutionSnapshotAssembler
 * Single responsibility: ExecutionChainReport → ExecutionSnapshot.
 * Dashboard must use this — never touch ExecutionChainReport directly.
 */
export class ExecutionSnapshotAssembler {
  fromReport(report: ExecutionChainReport): ExecutionSnapshot {
    const stages: StageSnapshot[] = report.stages.map(s => ({
      stage:      s.stage as string,
      status:     s.status === "COMPLETED" ? "COMPLETED"
                : s.status === "FAILED"    ? "FAILED"
                :                           "PENDING",
      durationMs: s.durationMs ?? 0,
      // summary: use only public fields — no internal 'input'/'output'
      summary:    s.error ?? `${s.stage} ${s.status.toLowerCase()}`,
    }));

    const audit  = report.auditResult;
    const expl   = report.explainabilityResult;
    const mem    = report.memoryResult;
    const result = report.finalOutput;

    // intentType: derived from explainabilityResult decisionLog (no StageOutputBag)
    const intentType = expl?.stagesExecuted?.includes("INTENT_RUNTIME") ? "conversational" : null;

    return Object.freeze({
      executionId:     report.chainId,
      sessionId:       report.sessionId,
      status:          report.status,
      startedAt:       report.startedAt,
      completedAt:     report.completedAt,
      totalDurationMs: report.totalDurationMs,
      stagesPassed:    report.stagesPassed,
      stagesTotal:     report.stagesTotal,
      stages:          Object.freeze(stages),
      compliance:      audit?.complianceStatus ?? null,
      confidence:      result?.confidence ?? expl?.confidenceScore ?? null,
      memorized:       mem?.memorized ?? null,
      connectorUsed:   null,   // EF-P01.11B: no StageOutputBag — connector info not exposed here
      intentType,
      humanSummary:    expl?.humanReadableSummary ?? null,
    });
  }
}