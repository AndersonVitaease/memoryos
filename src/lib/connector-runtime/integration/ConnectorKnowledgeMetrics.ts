/**
 * ConnectorKnowledgeMetrics.ts
 * Aggregates metrics from the Connector Knowledge integration layer.
 *
 * SRP: Metrics only.
 * Sprint: INTEGRATION-04
 */

import { ConnectorKnowledgeAudit } from "./ConnectorKnowledgeAudit";

export interface ConnectorKnowledgeMetricsSnapshot {
  readonly totalExecutions:      number;
  readonly avgConfidence:        number;
  readonly avgRisks:             number;
  readonly fallbackUsage:        number;
  readonly retryUsage:           number;
  readonly governanceViolations: number;
  readonly successRate:          number;
  readonly failureRate:          number;
  readonly avgDurationMs:        number;
  readonly connectorBreakdown:   Record<string, number>;
  readonly resultBreakdown:      Record<string, number>;
}

export const ConnectorKnowledgeMetrics = Object.freeze({

  snapshot(): ConnectorKnowledgeMetricsSnapshot {
    const entries = ConnectorKnowledgeAudit.getAll();
    const total   = entries.length;

    if (total === 0) {
      return { totalExecutions: 0, avgConfidence: 0, avgRisks: 0, fallbackUsage: 0, retryUsage: 0, governanceViolations: 0, successRate: 0, failureRate: 0, avgDurationMs: 0, connectorBreakdown: {}, resultBreakdown: {} };
    }

    const avgConfidence  = Math.round(entries.reduce((s, e) => s + e.confidence, 0) / total * 1000) / 1000;
    const avgRisks       = Math.round(entries.reduce((s, e) => s + e.risksFound, 0) / total * 10) / 10;
    const fallbackUsage  = entries.filter(e => e.fallbackStrategy !== "NONE").length;
    const retryUsage     = entries.filter(e => e.retryStrategy !== "NONE").length;
    const avgDurationMs  = Math.round(entries.reduce((s, e) => s + e.durationMs, 0) / total);
    const successCount   = entries.filter(e => e.result === "SUCCESS").length;
    const failureCount   = entries.filter(e => e.result === "FAILED" || e.result === "BLOCKED").length;

    const connectorBreakdown: Record<string, number> = {};
    const resultBreakdown:    Record<string, number> = {};
    for (const e of entries) {
      connectorBreakdown[e.connector] = (connectorBreakdown[e.connector] ?? 0) + 1;
      resultBreakdown[e.result]       = (resultBreakdown[e.result]       ?? 0) + 1;
    }

    return Object.freeze({
      totalExecutions: total, avgConfidence, avgRisks, fallbackUsage, retryUsage,
      governanceViolations: 0,
      successRate:  Math.round(successCount / total * 100),
      failureRate:  Math.round(failureCount / total * 100),
      avgDurationMs, connectorBreakdown, resultBreakdown,
    });
  },
});