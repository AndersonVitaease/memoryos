/**
 * ExecutionReporter.ts — Sprint 6.3.3
 * Generates AELReport from a completed execution
 */

import type { AELReport } from "./AELTypes";
import type { ExecutionContext } from "./ExecutionContext";

let _seq = 0;
function makeReportId(): string { return `arpt_${Date.now()}_${++_seq}`; }

export class ExecutionReporter {
  generate(ctx: ExecutionContext): AELReport {
    const d = ctx.data;
    const ready = d.state === "READY";

    const summary = ready
      ? `Sprint objective READY — ${d.stageResults.filter(s => s.status === "PASS").length}/${d.stageResults.length} stages passed · ${ctx.durationMs}ms`
      : `Execution FAILED at stage "${d.currentStage ?? "UNKNOWN"}" — ${d.stageResults.filter(s => s.status === "FAIL").length} failure(s) · ${ctx.durationMs}ms`;

    return {
      id: makeReportId(),
      executionId: d.id,
      objective: d.objective,
      generatedAt: Date.now(),
      finalState: d.state,
      ready,
      durationMs: ctx.durationMs,
      stageResults: [...d.stageResults],
      plan: d.plan,
      regressionScore: d.regressionScore,
      acceptanceScore: d.acceptanceScore,
      evidenceCount: d.evidence.length,
      lessonsLearned: [...d.lessonsLearned],
      summary,
    };
  }
}