/**
 * AcceptanceMetrics.ts — Sprint 6.3.2
 * Records runtime metrics for acceptance operations
 */

import type { AcceptanceMetricSnapshot } from "./EAFTypes";

export class AcceptanceMetrics {
  private _runs: Array<{ durationMs: number; score: number; confidence: number; ready: boolean; at: number }> = [];
  private _reruns = 0;
  private _recoveryTimes: number[] = [];

  recordRun(durationMs: number, score: number, confidence: number, ready: boolean): void {
    this._runs.push({ durationMs, score, confidence, ready, at: Date.now() });
  }

  recordRerun(): void { this._reruns++; }

  recordRecovery(ms: number): void { this._recoveryTimes.push(ms); }

  snapshot(): AcceptanceMetricSnapshot {
    const n = this._runs.length;
    if (n === 0) {
      return {
        totalRuns: 0, passRate: 0, failRate: 0, avgDurationMs: 0,
        avgScore: 0, avgConfidence: 0, reruns: this._reruns,
        recoveryMs: 0, lastRunAt: null,
      };
    }
    const passed = this._runs.filter(r => r.ready).length;
    return {
      totalRuns: n,
      passRate: Math.round((passed / n) * 100),
      failRate: Math.round(((n - passed) / n) * 100),
      avgDurationMs: Math.round(this._runs.reduce((s, r) => s + r.durationMs, 0) / n),
      avgScore: Math.round(this._runs.reduce((s, r) => s + r.score, 0) / n),
      avgConfidence: Math.round(this._runs.reduce((s, r) => s + r.confidence, 0) / n),
      reruns: this._reruns,
      recoveryMs: this._recoveryTimes.length
        ? Math.round(this._recoveryTimes.reduce((s, v) => s + v, 0) / this._recoveryTimes.length)
        : 0,
      lastRunAt: this._runs[n - 1].at,
    };
  }
}