/**
 * EngineeringKnowledgeMetrics.ts
 * Aggregates metrics from the Engineering Knowledge integration layer.
 *
 * SRP: Metrics only.
 * Sprint: INTEGRATION-05
 */

import { EngineeringKnowledgeAudit } from "./EngineeringKnowledgeAudit";

export interface EngineeringKnowledgeMetricsSnapshot {
  readonly totalTasks:            number;
  readonly avgConfidence:         number;
  readonly avgRisks:              number;
  readonly architectureViolations:number;
  readonly avgReviews:            number;
  readonly avgTests:              number;
  readonly successRate:           number;
  readonly blockRate:             number;
  readonly avgDurationMs:         number;
  readonly taskBreakdown:         Record<string, number>;
  readonly resultBreakdown:       Record<string, number>;
}

export const EngineeringKnowledgeMetrics = Object.freeze({

  snapshot(): EngineeringKnowledgeMetricsSnapshot {
    const entries = EngineeringKnowledgeAudit.getAll();
    const total   = entries.length;

    if (total === 0) {
      return { totalTasks: 0, avgConfidence: 0, avgRisks: 0, architectureViolations: 0, avgReviews: 0, avgTests: 0, successRate: 0, blockRate: 0, avgDurationMs: 0, taskBreakdown: {}, resultBreakdown: {} };
    }

    const avgConfidence = Math.round(entries.reduce((s, e) => s + e.confidence, 0) / total * 1000) / 1000;
    const avgRisks      = Math.round(entries.reduce((s, e) => s + e.risksFound, 0) / total * 10) / 10;
    const avgReviews    = Math.round(entries.reduce((s, e) => s + e.mandatoryReviews, 0) / total * 10) / 10;
    const avgTests      = Math.round(entries.reduce((s, e) => s + e.requiredTests, 0) / total * 10) / 10;
    const avgDurationMs = Math.round(entries.reduce((s, e) => s + e.durationMs, 0) / total);
    const successCount  = entries.filter(e => e.result === "APPROVED" || e.result === "COMPLETED").length;
    const blockCount    = entries.filter(e => e.result === "BLOCKED").length;

    const taskBreakdown:   Record<string, number> = {};
    const resultBreakdown: Record<string, number> = {};
    for (const e of entries) {
      taskBreakdown[e.task]   = (taskBreakdown[e.task]   ?? 0) + 1;
      resultBreakdown[e.result] = (resultBreakdown[e.result] ?? 0) + 1;
    }

    return Object.freeze({
      totalTasks: total, avgConfidence, avgRisks, architectureViolations: 0,
      avgReviews, avgTests,
      successRate: Math.round(successCount / total * 100),
      blockRate:   Math.round(blockCount   / total * 100),
      avgDurationMs, taskBreakdown, resultBreakdown,
    });
  },
});