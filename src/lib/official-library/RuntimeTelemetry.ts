/**
 * RuntimeTelemetry.ts — Sprint EF-7.2.7
 *
 * Collects resolution telemetry for the Runtime Layer.
 * SRP: telemetry recording only — no resolution logic.
 */

export interface RuntimeTelemetrySnapshot {
  readonly totalResolutions: number;
  readonly successfulResolutions: number;
  readonly failedResolutions: number;
  readonly avgResolutionMs: number;
  readonly successRate: number;
  readonly lastSelectedId: string;
  readonly lastResolutionAt: string | null;
}

class RuntimeTelemetryImpl {
  private _total       = 0;
  private _successful  = 0;
  private _totalMs     = 0;
  private _lastId      = "";
  private _lastAt: string | null = null;

  record(runtimeId: string, durationMs: number, success: boolean): void {
    this._total++;
    this._totalMs  += durationMs;
    this._lastId    = runtimeId;
    this._lastAt    = new Date().toISOString();
    if (success) this._successful++;
  }

  snapshot(): RuntimeTelemetrySnapshot {
    const failed = this._total - this._successful;
    return Object.freeze({
      totalResolutions:      this._total,
      successfulResolutions: this._successful,
      failedResolutions:     failed,
      avgResolutionMs:       this._total > 0 ? +(this._totalMs / this._total).toFixed(2) : 0,
      successRate:           this._total > 0 ? +(this._successful / this._total) : 0,
      lastSelectedId:        this._lastId,
      lastResolutionAt:      this._lastAt,
    });
  }

  reset(): void {
    this._total      = 0;
    this._successful = 0;
    this._totalMs    = 0;
    this._lastId     = "";
    this._lastAt     = null;
  }
}

const G = globalThis as typeof globalThis & { __RUNTIME_TELEMETRY__?: RuntimeTelemetryImpl };
if (!G.__RUNTIME_TELEMETRY__) G.__RUNTIME_TELEMETRY__ = new RuntimeTelemetryImpl();
export const RuntimeTelemetry: RuntimeTelemetryImpl = G.__RUNTIME_TELEMETRY__;