// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeMetrics
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

export interface MetricsSnapshot {
  executions: number;
  successes: number;
  failures: number;
  cancellations: number;
  timeouts: number;
  retries: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  throughputPerMin: number;
  successRate: number;
}

export class RuntimeMetrics {
  private _executions = 0;
  private _successes = 0;
  private _failures = 0;
  private _cancellations = 0;
  private _timeouts = 0;
  private _retries = 0;
  private _durations: number[] = [];
  private _windowMs: number;
  private _timestamps: number[] = [];
  private _clock: () => number;

  constructor(windowMs = 60000, clock: () => number = () => Date.now()) {
    this._windowMs = windowMs;
    this._clock = clock;
  }

  recordExecution(): void { this._executions++; this._timestamps.push(this._clock()); this._trim(); }
  recordSuccess(durationMs: number): void { this._successes++; this._durations.push(durationMs); }
  recordFailure(): void { this._failures++; }
  recordCancellation(): void { this._cancellations++; }
  recordTimeout(): void { this._timeouts++; }
  recordRetry(): void { this._retries++; }

  snapshot(): MetricsSnapshot {
    const d = this._durations;
    const avg = d.length > 0 ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    const min = d.length > 0 ? Math.min(...d) : 0;
    const max = d.length > 0 ? Math.max(...d) : 0;
    const successRate = this._executions > 0 ? this._successes / this._executions : 0;
    this._trim();
    const throughput = this._timestamps.length;
    return Object.freeze({
      executions: this._executions,
      successes: this._successes,
      failures: this._failures,
      cancellations: this._cancellations,
      timeouts: this._timeouts,
      retries: this._retries,
      avgDurationMs: parseFloat(avg.toFixed(2)),
      minDurationMs: parseFloat(min.toFixed(2)),
      maxDurationMs: parseFloat(max.toFixed(2)),
      throughputPerMin: throughput,
      successRate: parseFloat(successRate.toFixed(4)),
    });
  }

  reset(): void {
    this._executions = 0; this._successes = 0; this._failures = 0;
    this._cancellations = 0; this._timeouts = 0; this._retries = 0;
    this._durations = []; this._timestamps = [];
  }

  private _trim(): void {
    const cutoff = this._clock() - this._windowMs;
    this._timestamps = this._timestamps.filter(t => t >= cutoff);
  }
}