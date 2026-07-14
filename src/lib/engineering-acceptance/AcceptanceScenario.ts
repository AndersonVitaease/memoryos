/**
 * AcceptanceScenario.ts — Sprint 6.3.2
 * Defines a runnable scenario bound to an AcceptanceCriterion
 */

import type { AcceptanceCriterion, AcceptanceAssertionResult, AcceptanceEvidence, AcceptanceStatus } from "./EAFTypes";

export interface ScenarioRunContext {
  sprintId: string;
  runId: string;
}

export type ScenarioRunner = (ctx: ScenarioRunContext) => Promise<{
  status: AcceptanceStatus;
  detail: string;
  evidence?: Omit<AcceptanceEvidence, "id" | "criterionId" | "capturedAt">[];
  rca?: string;
}>;

export interface AcceptanceScenario {
  criterion: AcceptanceCriterion;
  run: ScenarioRunner;
}

let _eid = 0;
function makeEvidenceId(): string { return `ev_${Date.now()}_${++_eid}`; }

export async function executeScenario(
  scenario: AcceptanceScenario,
  ctx: ScenarioRunContext
): Promise<AcceptanceAssertionResult> {
  const t0 = Date.now();
  try {
    const result = await scenario.run(ctx);
    const evidence: AcceptanceEvidence[] = (result.evidence ?? []).map(e => ({
      ...e,
      id: makeEvidenceId(),
      criterionId: scenario.criterion.id,
      capturedAt: Date.now(),
    }));
    return {
      criterionId: scenario.criterion.id,
      description: scenario.criterion.description,
      category: scenario.criterion.category,
      status: result.status,
      detail: result.detail,
      durationMs: Date.now() - t0,
      evidence,
      rca: result.rca,
    };
  } catch (err) {
    return {
      criterionId: scenario.criterion.id,
      description: scenario.criterion.description,
      category: scenario.criterion.category,
      status: "FAIL",
      detail: `Exception: ${String(err)}`,
      durationMs: Date.now() - t0,
      evidence: [],
      rca: `Unhandled exception in scenario "${scenario.criterion.description}": ${String(err)}`,
    };
  }
}