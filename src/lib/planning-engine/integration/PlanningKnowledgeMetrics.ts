/**
 * PlanningKnowledgeMetrics.ts
 * Aggregates metrics from the Planning Knowledge integration layer.
 *
 * SRP: Metrics only — read-only aggregation.
 * Sprint: INTEGRATION-01
 */

import { PlanningKnowledgeAudit } from "./PlanningKnowledgeAudit";

export interface PlanningKnowledgeMetricsSnapshot {
  readonly totalPlans:          number;
  readonly knowledgeConsulted:  number;
  readonly knowledgeUsed:       number;
  readonly knowledgeDiscarded:  number;
  readonly avgQueryTimeMs:      number;
  readonly totalConflicts:      number;
  readonly totalRecommendations:number;
  readonly topLessons:          string[];
  readonly topBestPractices:    string[];
  readonly topKnownIssues:      string[];
}

export const PlanningKnowledgeMetrics = Object.freeze({

  snapshot(): PlanningKnowledgeMetricsSnapshot {
    const audits = PlanningKnowledgeAudit.getAll();

    const totalPlans          = audits.length;
    const knowledgeUsed       = audits.reduce((s, a) => s + a.knowledgeUsed.length, 0);
    const knowledgeDiscarded  = audits.reduce((s, a) => s + a.knowledgeDropped.length, 0);
    const knowledgeConsulted  = knowledgeUsed + knowledgeDiscarded;
    const avgQueryTimeMs      = totalPlans > 0
      ? Math.round(audits.reduce((s, a) => s + a.durationMs, 0) / totalPlans)
      : 0;
    const totalConflicts      = audits.reduce((s, a) => s + a.conflicts, 0);
    const totalRecommendations= audits.reduce((s, a) => s + a.recommendations, 0);

    return {
      totalPlans,
      knowledgeConsulted,
      knowledgeUsed,
      knowledgeDiscarded,
      avgQueryTimeMs,
      totalConflicts,
      totalRecommendations,
      topLessons:      [],
      topBestPractices:[],
      topKnownIssues:  [],
    };
  },
});