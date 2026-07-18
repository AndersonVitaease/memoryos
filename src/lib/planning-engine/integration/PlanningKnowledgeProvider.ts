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
import { KnowledgeQueryFacade } from "@/lib/knowledge-query/KnowledgeQueryFacade";

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

export interface RawKnowledgeBundle {
  readonly lessons:      KnowledgeItem[];
  readonly bestPractices:KnowledgeItem[];
  readonly knownIssues:  KnowledgeItem[];
  readonly antiPatterns: KnowledgeItem[];
  readonly journal:      KnowledgeItem[];
  readonly governance:   KnowledgeItem[];
  readonly all:          KnowledgeItem[];
}

function toItem(r: { id: string; source: string; title: string; summary: string; category: string; components: string[]; tags: string[]; evidenceScore: number; confidence: number; occurrences: number; priority: string; sprint: string; createdAt: string }): KnowledgeItem {
  return {
    id:            r.id,
    kind:          (r.source as KnowledgeItemKind) ?? (r.category as KnowledgeItemKind) ?? "LESSON",
    title:         r.title,
    summary:       r.summary,
    category:      r.category,
    components:    r.components,
    tags:          r.tags,
    evidenceScore: r.evidenceScore,
    confidence:    r.confidence,
    occurrences:   r.occurrences,
    priority:      r.priority,
    sprint:        r.sprint,
    createdAt:     r.createdAt,
  };
}

export const PlanningKnowledgeProvider = Object.freeze({

  /** Now delegates exclusively to KnowledgeQueryFacade — no direct Registry access */
  fetch(ctx: PlanningKnowledgeContext): RawKnowledgeBundle {
    const intent = ctx.intent;
    const lessons       = KnowledgeQueryFacade.queryLessons(intent).results.map(toItem);
    const bestPractices = KnowledgeQueryFacade.queryBestPractices(intent).results.map(toItem);
    const knownIssues   = KnowledgeQueryFacade.queryKnownIssues(intent).results.map(toItem);
    const antiPatterns  = KnowledgeQueryFacade.queryAntiPatterns(intent).results.map(toItem);
    const journal       = KnowledgeQueryFacade.queryJournal(intent).results.map(toItem);
    const governance    = KnowledgeQueryFacade.queryGovernance(intent).results.map(toItem);

    return {
      lessons, bestPractices, knownIssues, antiPatterns, journal, governance,
      all: [...lessons, ...bestPractices, ...knownIssues, ...antiPatterns, ...journal, ...governance],
    };
  },
});