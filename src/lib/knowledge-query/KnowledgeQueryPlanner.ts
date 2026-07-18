/**
 * KnowledgeQueryPlanner.ts
 * Builds an ordered execution plan from a KnowledgeQuery.
 *
 * SRP: Planning only — no execution, no filtering.
 * Sprint: INTEGRATION-02
 */

import type { KnowledgeQuery, KnowledgeExecutionPlan, KnowledgeExecutionStep, KnowledgeSource } from "./KnowledgeQueryTypes";

const SOURCE_REASONS: Record<KnowledgeSource, string> = {
  LESSONS:       "Retrieve experiential lessons learned",
  BEST_PRACTICES:"Retrieve validated best practices",
  KNOWN_ISSUES:  "Retrieve known issues to surface risks",
  ANTI_PATTERNS: "Retrieve anti-patterns to avoid",
  JOURNAL:       "Retrieve engineering journal entries",
  GOVERNANCE:    "Retrieve active governance policies",
  ALL:           "Full knowledge base scan",
};

export const KnowledgeQueryPlanner = Object.freeze({

  plan(query: KnowledgeQuery): KnowledgeExecutionPlan {
    const sources = (query.filter.sources ?? []).filter(s => s !== "ALL") as KnowledgeSource[];

    // Governance always runs last so its policies can override ranking
    const ordered = [
      ...sources.filter(s => s !== "GOVERNANCE"),
      ...sources.filter(s => s === "GOVERNANCE"),
    ];

    const steps: KnowledgeExecutionStep[] = ordered.map((source, i) => ({
      order:  i + 1,
      source,
      reason: SOURCE_REASONS[source] ?? source,
    }));

    return { queryId: query.id, steps, policy: query.policy };
  },
});