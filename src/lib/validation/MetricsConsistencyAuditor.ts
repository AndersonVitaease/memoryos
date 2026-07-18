/**
 * MetricsConsistencyAuditor.ts — Sprint P-02.1
 *
 * Validates consistency between ExecutionReport, ExecutionSnapshot,
 * and ValidationMetrics for each result.
 * No divergence in duration, stages, or status is allowed.
 */

import type { ValidationResult } from "./ValidationTypes";
import type { ExecutionChainReport } from "../execution-chain/ExecutionChainTypes";
import type { ExecutionSnapshot } from "../execution-chain/ExecutionSnapshot";

export interface ConsistencyViolation {
  readonly scenarioId: string;
  readonly field:      string;
  readonly reportVal:  unknown;
  readonly snapVal:    unknown;
  readonly metricsVal: unknown;
  readonly message:    string;
}

export interface ConsistencyAuditResult {
  readonly consistent:  boolean;
  readonly violations:  readonly ConsistencyViolation[];
  readonly checkedAt:   number;
  readonly totalChecked: number;
}

export const MetricsConsistencyAuditor = {
  auditAll(results: readonly ValidationResult[]): ConsistencyAuditResult {
    const violations: ConsistencyViolation[] = [];

    for (const r of results) {
      const report   = r.report   as ExecutionChainReport;
      const snapshot = r.snapshot as ExecutionSnapshot;
      const metrics  = r.metrics;

      if (!report || !snapshot || !metrics) continue;

      // 1. Status consistency: report ↔ snapshot
      if (report.status !== snapshot.status) {
        violations.push({
          scenarioId: r.scenarioId,
          field: "status",
          reportVal:  report.status,
          snapVal:    snapshot.status,
          metricsVal: r.status,
          message: `Status mismatch: report="${report.status}" snap="${snapshot.status}"`,
        });
      }

      // 2. Stages passed: report ↔ snapshot ↔ metrics
      if (report.stagesPassed !== snapshot.stagesPassed) {
        violations.push({
          scenarioId: r.scenarioId,
          field: "stagesPassed",
          reportVal:  report.stagesPassed,
          snapVal:    snapshot.stagesPassed,
          metricsVal: metrics.stagesPassed,
          message: `stagesPassed mismatch: report=${report.stagesPassed} snap=${snapshot.stagesPassed}`,
        });
      }
      if (report.stagesPassed !== metrics.stagesPassed) {
        violations.push({
          scenarioId: r.scenarioId,
          field: "stagesPassed(metrics)",
          reportVal:  report.stagesPassed,
          snapVal:    snapshot.stagesPassed,
          metricsVal: metrics.stagesPassed,
          message: `stagesPassed mismatch: report=${report.stagesPassed} metrics=${metrics.stagesPassed}`,
        });
      }

      // 3. Total stages
      if (report.stagesTotal !== snapshot.stagesTotal) {
        violations.push({
          scenarioId: r.scenarioId,
          field: "stagesTotal",
          reportVal:  report.stagesTotal,
          snapVal:    snapshot.stagesTotal,
          metricsVal: metrics.stagesTotal,
          message: `stagesTotal mismatch: report=${report.stagesTotal} snap=${snapshot.stagesTotal}`,
        });
      }

      // 4. Duration: snapshot ↔ metrics (must match exactly, both derived from same report)
      if (snapshot.totalDurationMs !== metrics.totalDurationMs) {
        violations.push({
          scenarioId: r.scenarioId,
          field: "totalDurationMs",
          reportVal:  report.totalDurationMs,
          snapVal:    snapshot.totalDurationMs,
          metricsVal: metrics.totalDurationMs,
          message: `totalDurationMs mismatch: snap=${snapshot.totalDurationMs} metrics=${metrics.totalDurationMs}`,
        });
      }

      // 5. sessionId round-trip: report ↔ snapshot
      if (report.sessionId !== snapshot.sessionId) {
        violations.push({
          scenarioId: r.scenarioId,
          field: "sessionId",
          reportVal:  report.sessionId,
          snapVal:    snapshot.sessionId,
          metricsVal: null,
          message: `sessionId mismatch: report="${report.sessionId}" snap="${snapshot.sessionId}"`,
        });
      }
    }

    return Object.freeze({
      consistent:   violations.length === 0,
      violations:   Object.freeze(violations),
      checkedAt:    Date.now(),
      totalChecked: results.length,
    });
  },
};