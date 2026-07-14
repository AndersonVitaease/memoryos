/**
 * RuntimeMetrics.ts — Sprint 6.3.1
 * Collects and aggregates runtime performance metrics.
 */

import type { RuntimeMetricsSnapshot } from "./SHRTypes";

interface TimedRecord {
  durationMs: number;
  success: boolean;
  timestamp: number;
}

export class RuntimeMetrics {
  private _restarts:   TimedRecord[] = [];
  private _recoveries: TimedRecord[] = [];
  private _warmups:    TimedRecord[] = [];
  private _startedAt   = Date.now();
  private _downtimeMs  = 0;
  private _lastDownAt?: number;

  recordRestart(durationMs: number, success: boolean): void {
    this._restarts.unshift({ durationMs, success, timestamp: Date.now() });
    if (this._restarts.length > 200) this._restarts.splice(200);
  }

  recordRecovery(durationMs: number, success: boolean): void {
    this._recoveries.unshift({ durationMs, success, timestamp: Date.now() });
    if (this._recoveries.length > 200) this._recoveries.splice(200);
  }

  recordWarmup(durationMs: number, success: boolean): void {
    this._warmups.unshift({ durationMs, success, timestamp: Date.now() });
    if (this._warmups.length > 200) this._warmups.splice(200);
  }

  markDown(): void { this._lastDownAt = Date.now(); }

  markUp(): void {
    if (this._lastDownAt) {
      this._downtimeMs += Date.now() - this._lastDownAt;
      this._lastDownAt = undefined;
    }
  }

  snapshot(): RuntimeMetricsSnapshot {
    const avg = (arr: TimedRecord[]) =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((s, r) => s + r.durationMs, 0) / arr.length);

    const successRate = (arr: TimedRecord[]) =>
      arr.length === 0 ? 100 : Math.round((arr.filter(r => r.success).length / arr.length) * 100);

    const uptimeMs = Date.now() - this._startedAt - this._downtimeMs;
    const totalMs  = Date.now() - this._startedAt;
    const availabilityPercent = totalMs === 0 ? 100 : Math.round((uptimeMs / totalMs) * 100);

    return {
      avgRestartMs:          avg(this._restarts),
      avgRecoveryMs:         avg(this._recoveries),
      avgWarmupMs:           avg(this._warmups),
      availabilityPercent,
      totalRecoveries:       this._recoveries.length,
      totalRestarts:         this._restarts.length,
      totalWarmups:          this._warmups.length,
      successRate:           successRate([...this._restarts, ...this._recoveries, ...this._warmups]),
      uptimeMs,
      lastRestartAt:         this._restarts[0]?.timestamp,
      lastRecoveryAt:        this._recoveries[0]?.timestamp,
    };
  }

  reset(): void {
    this._restarts = [];
    this._recoveries = [];
    this._warmups = [];
    this._startedAt = Date.now();
    this._downtimeMs = 0;
    this._lastDownAt = undefined;
  }
}