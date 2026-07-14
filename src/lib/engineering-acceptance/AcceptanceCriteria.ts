/**
 * AcceptanceCriteria.ts — Sprint 6.3.2
 * Built-in criteria definitions per category
 */

import type { AcceptanceCriterion, AcceptanceCategory } from "./EAFTypes";

let _seq = 0;
export function makeCriterionId(prefix: string): string {
  return `${prefix}_${++_seq}`;
}

export function buildCriteria(
  items: Array<{ desc: string; cat: AcceptanceCategory; mandatory?: boolean }>
): AcceptanceCriterion[] {
  return items.map(i => ({
    id: makeCriterionId(i.cat.toLowerCase()),
    description: i.desc,
    category: i.cat,
    mandatory: i.mandatory !== false,
    timeout: 30000,
  }));
}

// ── Built-in criteria for Sprint 6.3.1 (SHR) ─────────────────────────────────

export const SHR_CRITERIA: AcceptanceCriterion[] = buildCriteria([
  { desc: "Runtime Watcher detects and fires triggers", cat: "RUNTIME" },
  { desc: "Restart Manager builds and executes dependency chain", cat: "RUNTIME" },
  { desc: "Snapshot captures full state before restart", cat: "RUNTIME" },
  { desc: "Restore rehydrates state after restart", cat: "RUNTIME" },
  { desc: "Warm-up completes all 5 steps", cat: "RUNTIME" },
  { desc: "Recovery retries and resolves degraded modules", cat: "RUNTIME" },
  { desc: "Audit is append-only — no deletions", cat: "RUNTIME" },
  { desc: "Regression Shield passes with SHR category", cat: "REGRESSION_SHIELD" },
  { desc: "EventBus emits and receives all lifecycle events", cat: "RUNTIME" },
  { desc: "Metrics snapshot reflects actual operations", cat: "RUNTIME" },
]);

// ── Built-in criteria for Sprint 6.3.2 (EAF) ─────────────────────────────────

export const EAF_CRITERIA: AcceptanceCriterion[] = buildCriteria([
  { desc: "AcceptanceEngine initializes and runs", cat: "ACCEPTANCE" },
  { desc: "AcceptanceRegistry stores and retrieves sprint registrations", cat: "ACCEPTANCE" },
  { desc: "AcceptanceRunner executes all pipeline stages", cat: "ACCEPTANCE" },
  { desc: "Assertions produce PASS/FAIL/SKIP/BLOCKED results", cat: "ACCEPTANCE" },
  { desc: "Evidence is captured for every assertion", cat: "ACCEPTANCE" },
  { desc: "Validator blocks READY if any mandatory criterion FAILs", cat: "ACCEPTANCE" },
  { desc: "Reporter generates complete AcceptanceReport", cat: "ACCEPTANCE" },
  { desc: "History is append-only and permanent", cat: "ACCEPTANCE" },
  { desc: "Metrics reflect actual run data", cat: "ACCEPTANCE" },
  { desc: "Audit records all actions immutably", cat: "ACCEPTANCE" },
]);