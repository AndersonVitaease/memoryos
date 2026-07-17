// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-16: ExecutionReportAssembler
// Single responsibility: ExecutionState → ExecutionChainReport.
// ExecutionChain must NOT assemble the report — it delegates here.
// ══════════════════════════════════════════════════════════════════════════════

import type { ExecutionState }        from "./ExecutionState";
import type { ExecutionChainReport }  from "./ExecutionChainTypes";
import type { UserInput }             from "./ExecutionChainTypes";

export class ExecutionReportAssembler {
  assemble(
    chainId:     string,
    startedAt:   number,
    completedAt: number,
    input:       UserInput,
    state:       ExecutionState,
    success:     boolean,
  ): ExecutionChainReport {
    const stages    = state.records;
    const passed    = stages.filter(s => s.status === "COMPLETED").length;

    return Object.freeze({
      chainId,
      sessionId:            input.sessionId,
      userId:               input.userId,
      startedAt,
      completedAt,
      totalDurationMs:      completedAt - startedAt,
      status:               success ? "COMPLETED" as const : "FAILED" as const,
      stages:               Object.freeze(stages),
      userInput:            input,
      finalOutput:          success ? (state.result   ?? null) : null,
      memoryResult:         success ? (state.memory   ?? null) : null,
      explainabilityResult: success ? (state.explainability ?? null) : null,
      auditResult:          success ? (state.audit    ?? null) : null,
      stagesPassed:         passed,
      stagesTotal:          stages.length,
    }) as ExecutionChainReport;
  }
}