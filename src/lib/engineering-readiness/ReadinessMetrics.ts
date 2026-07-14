/**
 * ReadinessMetrics.ts — Sprint 6.3.5
 * Tracks ERC run statistics over time.
 */

import type { ReadinessMetricSnapshot, CertificationLevel, ValidatorStatus } from "./ReadinessTypes";

interface RunRecord {
  overallScore: number;
  durationMs: number;
  certification: CertificationLevel;
  passed: boolean;
}

export class ReadinessMetrics {
  private _runs: RunRecord[] = [];

  recordRun(overallScore: number, durationMs: number, certification: CertificationLevel): void {
    this._runs.push({
      overallScore,
      durationMs,
      certification,
      passed: overallScore >= 95,
    });
  }

  snapshot(): ReadinessMetricSnapshot {
    const n = this._runs.length;
    if (n === 0) {
      return {
        totalRuns: 0, passRuns: 0, failRuns: 0,
        avgOverallScore: 0, bestScore: 0, worstScore: 0,
        lastCertification: null, avgDurationMs: 0,
      };
    }
    const scores = this._runs.map(r => r.overallScore);
    const pass = this._runs.filter(r => r.passed).length;
    return {
      totalRuns: n,
      passRuns: pass,
      failRuns: n - pass,
      avgOverallScore: Math.round(scores.reduce((a, b) => a + b, 0) / n),
      bestScore: Math.max(...scores),
      worstScore: Math.min(...scores),
      lastCertification: this._runs[n - 1].certification,
      avgDurationMs: Math.round(this._runs.reduce((a, r) => a + r.durationMs, 0) / n),
    };
  }

  all(): RunRecord[] { return [...this._runs]; }
}