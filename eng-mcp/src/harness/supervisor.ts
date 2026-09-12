/**
 * GH-05 — Supervisor: ADVISORY ONLY. It reviews worker results, names gaps and
 * recommends CONTINUE / RECOVER / COMPLETE. A recommendation — even COMPLETE —
 * never produces PASS: only the Guardian (CompletionGuard + Evidence + Budget
 * + Permissions) concludes the mission. This keeps the historical bug
 * (high sufficiency + remaining gaps → wrong SUCCESS) structurally impossible:
 * the supervisor has no decision channel into the mission state.
 */
import { SupervisorReport, SupervisorReviewInput } from './multiAgentTypes.js';

export interface SupervisorAgent {
  review(input: SupervisorReviewInput): Promise<SupervisorReport> | SupervisorReport;
}

/**
 * Deterministic builtin supervisor: COMPLETE only when every planned action
 * ended 'ok' and produced its expectedEvidence; any gap (failed, transient,
 * hard, cancelled, budget-blocked, dependency-failed or missing evidence)
 * becomes a named gap and a RECOVER recommendation. CONTINUE is left to
 * injected advisors/supervisors for richer strategies.
 */
export class DeterministicSupervisor implements SupervisorAgent {
  review(input: SupervisorReviewInput): SupervisorReport {
    const gaps: string[] = [];
    for (const action of input.plan.actions) {
      const result = input.results.get(action.id);
      if (!result) {
        gaps.push(`action:${action.id}:no_result`);
        continue;
      }
      if (result.status !== 'ok') {
        gaps.push(`action:${action.id}:${result.status}`);
        continue;
      }
      for (const key of action.expectedEvidence ?? []) {
        const produced = result.evidence.some((e) => e.key === key && e.status === 'ok');
        if (!produced) gaps.push(`action:${action.id}:expected_evidence_missing:${key}`);
      }
    }
    return {
      recommendation: gaps.length === 0 ? 'COMPLETE' : 'RECOVER',
      gaps,
      reasons: gaps.length === 0 ? ['all_planned_actions_ok'] : ['planned_actions_with_gaps'],
    };
  }
}
