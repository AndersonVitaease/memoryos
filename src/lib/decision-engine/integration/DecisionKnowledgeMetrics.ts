/**
 * DecisionKnowledgeMetrics.ts
 * Aggregates metrics from the Decision Knowledge integration layer.
 *
 * SRP: Metrics only.
 * Sprint: INTEGRATION-03
 */

import { DecisionKnowledgeAudit } from "./DecisionKnowledgeAudit";

export interface DecisionKnowledgeMetricsSnapshot {
  readonly totalDecisions:       number;
  readonly avgConfidence:        number;
  readonly avgRisks:             number;
  readonly governanceViolations: number;
  readonly blockedDecisions:     number;
  readonly avgDurationMs:        number;
  readonly decisionBreakdown:    Record<string, number>;
}

export const DecisionKnowledgeMetrics = Object.freeze({

  snapshot(): DecisionKnowledgeMetricsSnapshot {
    const audits = DecisionKnowledgeAudit.getAll();
    const total  = audits.length;

    if (total === 0) {
      return { totalDecisions: 0, avgConfidence: 0, avgRisks: 0, governanceViolations: 0, blockedDecisions: 0, avgDurationMs: 0, decisionBreakdown: {} };
    }

    const avgConfidence  = Math.round((audits.reduce((s, a) => s + a.confidence, 0) / total) * 1000) / 1000;
    const avgRisks       = Math.round(audits.reduce((s, a) => s + a.risksFound, 0) / total * 10) / 10;
    const blockedDecisions = audits.filter(a => a.blockers > 0).length;
    const avgDurationMs  = Math.round(audits.reduce((s, a) => s + a.durationMs, 0) / total);

    const decisionBreakdown: Record<string, number> = {};
    for (const a of audits) {
      decisionBreakdown[a.recommendedDecision] = (decisionBreakdown[a.recommendedDecision] ?? 0) + 1;
    }

    return { totalDecisions: total, avgConfidence, avgRisks, governanceViolations: 0, blockedDecisions, avgDurationMs, decisionBreakdown };
  },
});