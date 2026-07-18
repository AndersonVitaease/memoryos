// KnowledgeStoreHealthMonitor.ts — Sprint EF-38.1
// Tracks store health without modifying store state.

export type HealthStatus = "healthy" | "degraded" | "offline";

export interface HealthSnapshot {
  readonly status:       HealthStatus;
  readonly latencyMs:    number;
  readonly availability: number;   // 0–1
  readonly lastCheckAt:  number;
  readonly uptimeMs:     number;
  readonly errorCount:   number;
  readonly warningCount: number;
  readonly engineId:     string;
  readonly details:      string;
}

const _startedAt = Date.now();
let _lastLatency  = 0;
let _errorCount   = 0;
let _warningCount = 0;
let _checkCount   = 0;
let _successChecks = 0;
let _engineId     = "none";
let _lastCheckAt  = 0;

function deriveStatus(latencyMs: number, successRate: number): HealthStatus {
  if (successRate < 0.5)   return "offline";
  if (latencyMs > 500 || successRate < 0.9) return "degraded";
  return "healthy";
}

export const KnowledgeStoreHealthMonitor = {
  setEngine(engineId: string): void {
    _engineId = engineId;
  },

  record(latencyMs: number, ok: boolean, details?: string): void {
    _checkCount++;
    _lastLatency = latencyMs;
    _lastCheckAt = Date.now();
    if (ok) { _successChecks++; }
    else    { _errorCount++; }
    if (latencyMs > 300 && ok) _warningCount++;
  },

  snapshot(): HealthSnapshot {
    const successRate  = _checkCount > 0 ? _successChecks / _checkCount : 1;
    const status       = deriveStatus(_lastLatency, successRate);
    return Object.freeze({
      status,
      latencyMs:    _lastLatency,
      availability: successRate,
      lastCheckAt:  _lastCheckAt,
      uptimeMs:     Date.now() - _startedAt,
      errorCount:   _errorCount,
      warningCount: _warningCount,
      engineId:     _engineId,
      details:      `${_checkCount} checks · ${_successChecks} ok · ${_errorCount} errors`,
    });
  },

  isHealthy(): boolean {
    return deriveStatus(_lastLatency, _checkCount > 0 ? _successChecks / _checkCount : 1) === "healthy";
  },

  reset(): void {
    _lastLatency = 0; _errorCount = 0; _warningCount = 0;
    _checkCount  = 0; _successChecks = 0; _lastCheckAt = 0; _engineId = "none";
  },
};