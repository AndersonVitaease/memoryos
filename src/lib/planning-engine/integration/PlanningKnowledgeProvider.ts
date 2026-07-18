/**
 * PlanningKnowledgeProvider.ts
 * Read-only gateway to the Operational Knowledge Base.
 *
 * SRP: Knowledge retrieval only — no modification, no ranking.
 * Sprint: INTEGRATION-01
 *
 * Reads from: Lessons, Best Practices, Known Issues, Anti Patterns,
 *             Engineering Journal, Governance Policies.
 * Official Library: strictly read-only.
 */

import type { PlanningKnowledgeContext } from "./PlanningKnowledgeContext";
import { GovernancePolicyRegistry } from "@/lib/operational-knowledge/governance/GovernancePolicyRegistry";
import { OperationalKnowledgeRegistry } from "@/lib/operational-knowledge/OperationalKnowledgeRegistry";

export type KnowledgeItemKind =
  | "LESSON"        | "BEST_PRACTICE" | "KNOWN_ISSUE"
  | "ANTI_PATTERN"  | "JOURNAL"       | "GOVERNANCE";

export interface KnowledgeItem {
  readonly id:            string;
  readonly kind:          KnowledgeItemKind;
  readonly title:         string;
  readonly summary:       string;
  readonly category:      string;
  readonly components:    string[];
  readonly tags:          string[];
  readonly evidenceScore: number;
  readonly confidence:    number;
  readonly occurrences:   number;
  readonly priority:      string;
  readonly sprint:        string;
  readonly createdAt:     string;
}

// Adapter: converts OKB entries to KnowledgeItem
function fromOKB(entries: ReturnType<typeof OperationalKnowledgeRegistry.getAll>): KnowledgeItem[] {
  return entries.map(e => ({
    id:            e.id,
    kind:          (e.category as KnowledgeItemKind) ?? "LESSON",
    title:         e.title,
    summary:       e.content?.slice(0, 200) ?? "",
    category:      e.category,
    components:    e.tags ?? [],
    tags:          e.tags ?? [],
    evidenceScore: 60,
    confidence:    0.70,
    occurrences:   1,
    priority:      "MEDIUM",
    sprint:        "",
    createdAt:     e.created_date ?? new Date().toISOString(),
  }));
}

function governanceItems(): KnowledgeItem[] {
  return GovernancePolicyRegistry.getActive().map(p => ({
    id:            p.id,
    kind:          "GOVERNANCE" as KnowledgeItemKind,
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
  }));
}

export interface RawKnowledgeBundle {
  readonly lessons:      KnowledgeItem[];
  readonly bestPractices:KnowledgeItem[];
  readonly knownIssues:  KnowledgeItem[];
  readonly antiPatterns: KnowledgeItem[];
  readonly journal:      KnowledgeItem[];
  readonly governance:   KnowledgeItem[];
  readonly all:          KnowledgeItem[];
}

export const PlanningKnowledgeProvider = Object.freeze({

  fetch(_ctx: PlanningKnowledgeContext): RawKnowledgeBundle {
    const all      = fromOKB(OperationalKnowledgeRegistry.getAll());
    const govItems = governanceItems();

    const lessons      = all.filter(i => i.category === "LESSON"        || i.kind === "LESSON");
    const bestPractices= all.filter(i => i.category === "BEST_PRACTICE" || i.kind === "BEST_PRACTICE");
    const knownIssues  = all.filter(i => i.category === "KNOWN_ISSUE"   || i.kind === "KNOWN_ISSUE");
    const antiPatterns = all.filter(i => i.category === "ANTI_PATTERN"  || i.kind === "ANTI_PATTERN");
    const journal      = all.filter(i => i.category === "JOURNAL"       || i.kind === "JOURNAL");

    return {
      lessons, bestPractices, knownIssues, antiPatterns, journal,
      governance: govItems,
      all: [...all, ...govItems],
    };
  },
});