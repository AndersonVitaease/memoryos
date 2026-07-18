/**
 * EvidenceCollector.ts
 * Collects and aggregates evidence records for analysis.
 *
 * Authority: ENGINEERING
 * SRP: Collection and aggregation only — no validation, no search.
 * Sprint: KB-02
 *
 * Read-only. Does NOT modify any evidence record or official document.
 */

import { EvidenceRegistry } from "./EvidenceRegistry";
import type { Evidence, EvidenceCategory, EvidenceSeverity } from "./EvidenceTypes";

export interface EvidenceCollection {
  readonly evidences:     Evidence[];
  readonly count:         number;
  readonly criticalCount: number;
  readonly openCount:     number;
  readonly resolvedCount: number;
}

export interface RecurringProblem {
  readonly pattern:         string;
  readonly occurrences:     number;
  readonly evidenceIds:     string[];
  readonly components:      string[];
  readonly lastSprint:      string;
}

export const EvidenceCollector = Object.freeze({
  /**
   * Collect all evidences, optionally filtered.
   */
  collect(filter?: {
    category?: EvidenceCategory;
    severity?: EvidenceSeverity;
    sprint?:   string;
    component?:string;
  }): EvidenceCollection {
    let all = EvidenceRegistry.getAll();

    if (filter?.category)  all = all.filter(e => e.category  === filter.category);
    if (filter?.severity)  all = all.filter(e => e.severity  === filter.severity);
    if (filter?.sprint)    all = EvidenceRegistry.getBySprint(filter.sprint);
    if (filter?.component) all = EvidenceRegistry.getByComponent(filter.component);

    return {
      evidences:     all,
      count:         all.length,
      criticalCount: all.filter(e => e.severity === "CRITICAL").length,
      openCount:     all.filter(e => e.status === "OPEN" || e.status === "INVESTIGATING").length,
      resolvedCount: all.filter(e => e.status === "RESOLVED").length,
    };
  },

  /**
   * Find recurring problems by component overlap.
   */
  findRecurringProblems(): RecurringProblem[] {
    const all = EvidenceRegistry.getAll();
    const componentMap = new Map<string, Evidence[]>();

    for (const e of all) {
      for (const c of (e.components ?? [])) {
        if (!componentMap.has(c)) componentMap.set(c, []);
        componentMap.get(c)!.push(e);
      }
    }

    const recurring: RecurringProblem[] = [];

    for (const [component, evidences] of componentMap.entries()) {
      if (evidences.length < 2) continue;
      recurring.push({
        pattern:     `Recurring issues in ${component}`,
        occurrences: evidences.length,
        evidenceIds: evidences.map(e => e.id),
        components:  [component],
        lastSprint:  evidences[evidences.length - 1].sprint,
      });
    }

    return recurring.sort((a, b) => b.occurrences - a.occurrences);
  },

  /**
   * Collect evidences by sprint, sorted chronologically.
   */
  collectBySprint(): Record<string, Evidence[]> {
    const result: Record<string, Evidence[]> = {};
    for (const e of EvidenceRegistry.getAll()) {
      if (!result[e.sprint]) result[e.sprint] = [];
      result[e.sprint].push(e);
    }
    return result;
  },

  /**
   * Get the most recently added evidences.
   */
  getLatest(limit = 5): Evidence[] {
    return EvidenceRegistry.getAll()
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  },

  /**
   * Collect all open/investigating evidences sorted by severity.
   */
  getOpenEvidences(): Evidence[] {
    const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    return EvidenceRegistry.getAll()
      .filter(e => e.status === "OPEN" || e.status === "INVESTIGATING")
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4));
  },
});