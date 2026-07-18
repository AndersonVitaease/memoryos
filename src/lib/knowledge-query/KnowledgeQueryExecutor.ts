/**
 * KnowledgeQueryExecutor.ts
 * Executes an execution plan, reading from knowledge sources (read-only).
 *
 * SRP: Execution only — delegates reads to adapters, never writes.
 * Sprint: INTEGRATION-02
 */

import { OperationalKnowledgeRegistry } from "@/lib/operational-knowledge/OperationalKnowledgeRegistry";
import { GovernancePolicyRegistry }      from "@/lib/operational-knowledge/governance/GovernancePolicyRegistry";
import type { KnowledgeExecutionPlan, KnowledgeResultItem, KnowledgeSource } from "./KnowledgeQueryTypes";

function nowIso(): string { return new Date().toISOString(); }

// Adapter: OKB entry → KnowledgeResultItem
function fromOKB(source: KnowledgeSource): KnowledgeResultItem[] {
  return OperationalKnowledgeRegistry.getAll().map(e => ({
    id:            e.id,
    source,
    title:         e.title,
    summary:       (e.content ?? "").slice(0, 200),
    category:      e.category ?? source,
    components:    e.tags ?? [],
    tags:          e.tags ?? [],
    evidenceScore: 60,
    confidence:    0.70,
    occurrences:   1,
    priority:      "MEDIUM",
    sprint:        "",
    createdAt:     e.created_date ?? nowIso(),
    score:         0,
  }));
}

function fromGovernance(): KnowledgeResultItem[] {
  return GovernancePolicyRegistry.getActive().map(p => ({
    id:            p.id,
    source:        "GOVERNANCE" as KnowledgeSource,
    title:         p.name,
    summary:       p.description,
    category:      "GOVERNANCE",
    components:    [],
    tags:          [p.scope],
    evidenceScore: 100,
    confidence:    1.0,
    occurrences:   1,
    priority:      p.priority,
    sprint:        "",
    createdAt:     p.createdAt,
    score:         0,
  }));
}

const SOURCE_CATEGORIES: Partial<Record<KnowledgeSource, string[]>> = {
  LESSONS:        ["LESSON", "LESSONS"],
  BEST_PRACTICES: ["BEST_PRACTICE", "BEST_PRACTICES"],
  KNOWN_ISSUES:   ["KNOWN_ISSUE", "KNOWN_ISSUES"],
  ANTI_PATTERNS:  ["ANTI_PATTERN", "ANTI_PATTERNS"],
  JOURNAL:        ["JOURNAL"],
};

export const KnowledgeQueryExecutor = Object.freeze({

  execute(plan: KnowledgeExecutionPlan): KnowledgeResultItem[] {
    const all: KnowledgeResultItem[] = [];

    for (const step of plan.steps) {
      if (step.source === "GOVERNANCE") {
        all.push(...fromGovernance());
      } else {
        const okbItems = fromOKB(step.source);
        const cats = SOURCE_CATEGORIES[step.source];
        if (cats) {
          all.push(...okbItems.filter(i => cats.some(c => i.category.toUpperCase().includes(c))));
        } else {
          all.push(...okbItems);
        }
      }
    }

    return all;
  },
});