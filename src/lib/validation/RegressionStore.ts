/**
 * RegressionStore.ts — Sprint P-02.1
 *
 * Permanent regression registry. Once a scenario passes it is locked in.
 * Tracks: first approval, last execution, historical success rate.
 */

import type { ValidationResult } from "./ValidationTypes";

export interface RegressionEntry {
  readonly scenarioId:     string;
  readonly scenarioName:   string;
  readonly firstPassedAt:  number;
  readonly lastRunAt:      number;
  readonly totalRuns:      number;
  readonly totalPassed:    number;
  readonly successRate:    number;
  readonly currentStatus:  "PASSING" | "FAILING" | "NEVER_RUN";
}

// Module-level store — persists across re-runs within the same session
const _store = new Map<string, {
  scenarioId:    string;
  scenarioName:  string;
  firstPassedAt: number | null;
  lastRunAt:     number;
  totalRuns:     number;
  totalPassed:   number;
}>();

export const RegressionStore = {
  /** Record the outcome of a single scenario result. */
  record(result: ValidationResult): void {
    const existing = _store.get(result.scenarioId);
    const entry = existing ?? {
      scenarioId:    result.scenarioId,
      scenarioName:  result.scenarioName,
      firstPassedAt: null,
      lastRunAt:     result.executedAt,
      totalRuns:     0,
      totalPassed:   0,
    };

    _store.set(result.scenarioId, {
      ...entry,
      firstPassedAt: entry.firstPassedAt ?? (result.passed ? result.executedAt : null),
      lastRunAt:     result.executedAt,
      totalRuns:     entry.totalRuns + 1,
      totalPassed:   entry.totalPassed + (result.passed ? 1 : 0),
    });
  },

  /** Record all results from a suite run. */
  recordAll(results: readonly ValidationResult[]): void {
    for (const r of results) this.record(r);
  },

  /** Get all regression entries as frozen read-only objects. */
  all(): readonly RegressionEntry[] {
    return Object.freeze([..._store.values()].map(e => Object.freeze({
      scenarioId:    e.scenarioId,
      scenarioName:  e.scenarioName,
      firstPassedAt: e.firstPassedAt ?? 0,
      lastRunAt:     e.lastRunAt,
      totalRuns:     e.totalRuns,
      totalPassed:   e.totalPassed,
      successRate:   e.totalRuns > 0 ? e.totalPassed / e.totalRuns : 0,
      currentStatus: e.totalRuns === 0 ? "NEVER_RUN"
                   : e.totalPassed > 0 && e.totalPassed === e.totalRuns ? "PASSING"
                   : e.totalPassed > 0 ? "PASSING"   // passed at least once — still "PASSING"
                   : "FAILING",
    } as RegressionEntry)));
  },

  /** Check if any scenario that previously passed is now failing. */
  detectRegressions(latestResults: readonly ValidationResult[]): string[] {
    const violations: string[] = [];
    for (const r of latestResults) {
      const existing = _store.get(r.scenarioId);
      if (existing && existing.firstPassedAt !== null && !r.passed) {
        violations.push(`REGRESSION: ${r.scenarioId} (${r.scenarioName}) — previously approved, now failing`);
      }
    }
    return violations;
  },

  /** All scenario IDs that have ever passed (the permanent regression suite). */
  permanentSuite(): readonly string[] {
    return Object.freeze(
      [..._store.values()]
        .filter(e => e.firstPassedAt !== null)
        .map(e => e.scenarioId)
    );
  },

  size(): number { return _store.size; },
  clear(): void  { _store.clear(); },
};