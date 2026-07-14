/**
 * ExecutionMetrics.ts — Sprint 6.3.3
 * Measures execution loop performance
 */

import type { AELMetricSnapshot } from "./AELTypes";

interface RunRecord {
  durationMs: number;
  stagesCompleted: number;
  reused: boolean;
  approved: boolean;
  rolledBack: boolean;
  recovered: boolean;
  accepted: boolean;
  ready: boolean;
  at: number;
}

export class ExecutionMetrics {
  private _runs: RunRecord[] = [];

  recordRun(r: Omit<RunRecord, "at">): void {
    this._runs.push({ ...r, at: Date.now() });
  }

  snapshot(): AELMetricSnapshot {
    const n = this._runs.length;
    if (n === 0) {
      return {
        totalExecutions: 0, successRate: 0, avgDurationMs: 0,
        avgStagesCompleted: 0, reuseRate: 0, approvalRate: 0,
        rollbackCount: 0, recoveryCount: 0, acceptanceRate: 0, lastExecutionAt: null,
      };
    }
    const ready      = this._runs.filter(r => r.ready).length;
    const reused     = this._runs.filter(r => r.reused).length;
    const approved   = this._runs.filter(r => r.approved).length;
    const rolledBack = this._runs.filter(r => r.rolledBack).length;
    const recovered  = this._runs.filter(r => r.recovered).length;
    const accepted   = this._runs.filter(r => r.accepted).length;
    return {
      totalExecutions:    n,
      successRate:        Math.round((ready / n) * 100),
      avgDurationMs:      Math.round(this._runs.reduce((s, r) => s + r.durationMs, 0) / n),
      avgStagesCompleted: Math.round(this._runs.reduce((s, r) => s + r.stagesCompleted, 0) / n),
      reuseRate:          Math.round((reused / n) * 100),
      approvalRate:       Math.round((approved / n) * 100),
      rollbackCount:      rolledBack,
      recoveryCount:      recovered,
      acceptanceRate:     Math.round((accepted / n) * 100),
      lastExecutionAt:    this._runs[n - 1].at,
    };
  }
}