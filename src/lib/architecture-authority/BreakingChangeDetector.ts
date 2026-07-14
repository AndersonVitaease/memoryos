/**
 * BreakingChangeDetector.ts — Sprint 6.2.3
 * Classifies breaking changes and blocks HIGH/CRITICAL automatically.
 */

import type { BreakingChange, BreakingChangeLevel, ContractDiff } from "./AATypes";
import { CORE_IMMUTABLE } from "./AATypes";

let _seq = 0;
function makeId(): string { return `bc_${Date.now()}_${++_seq}`; }

const CORE_SET = new Set(CORE_IMMUTABLE);

export class BreakingChangeDetector {
  detect(objective: string, affectedComponents: string[], diffs: ContractDiff[]): BreakingChange[] {
    const changes: BreakingChange[] = [];

    // From contract diffs
    for (const diff of diffs) {
      if (diff.breakingLevel === "SAFE") continue;
      const isCoreHit = affectedComponents.some(c => CORE_SET.has(c));
      const effectiveLevel: BreakingChangeLevel =
        isCoreHit && (diff.breakingLevel === "LOW" || diff.breakingLevel === "MEDIUM") ? "HIGH"
        : diff.breakingLevel;

      changes.push({
        id:          makeId(),
        component:   diff.contractName,
        level:       effectiveLevel,
        description: diff.details.join("; "),
        autoBlocked: effectiveLevel === "HIGH" || effectiveLevel === "CRITICAL",
        diffs:       [diff],
      });
    }

    // Heuristic — core components in objective
    for (const comp of affectedComponents) {
      if (CORE_SET.has(comp) && !changes.find(c => c.component === comp)) {
        const lower = objective.toLowerCase();
        const level: BreakingChangeLevel =
          /rewrite|replace|remove|delete|drop/i.test(lower) ? "CRITICAL"
          : /modify|change|update|alter/i.test(lower)       ? "HIGH"
          : /extend|enhance|add/i.test(lower)               ? "MEDIUM"
          : "LOW";

        changes.push({
          id:          makeId(),
          component:   comp,
          level,
          description: `Core component "${comp}" is in the implementation scope`,
          autoBlocked: level === "HIGH" || level === "CRITICAL",
          diffs:       [],
        });
      }
    }

    return changes;
  }

  maxLevel(changes: BreakingChange[]): BreakingChangeLevel {
    const order: BreakingChangeLevel[] = ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
    let max = 0;
    for (const c of changes) {
      const idx = order.indexOf(c.level);
      if (idx > max) max = idx;
    }
    return order[max];
  }

  isBlocked(changes: BreakingChange[]): boolean {
    return changes.some(c => c.autoBlocked);
  }
}