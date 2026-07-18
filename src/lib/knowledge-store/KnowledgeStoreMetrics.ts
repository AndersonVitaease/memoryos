// KnowledgeStoreMetrics.ts — Sprint EF-39.1 (hardened)
// EF-39.1: eliminated all "as any" casts — OperationName type is fully explicit and used everywhere.

export interface MetricsSnapshot {
  readonly storeCount:   number;
  readonly updateCount:  number;
  readonly archiveCount: number;
  readonly restoreCount: number;
  readonly deleteCount:  number;
  readonly queryCount:   number;
  readonly searchCount:  number;
  readonly existsCount:  number;
  readonly healthCount:  number;
  readonly totalOps:     number;
  readonly failureCount: number;
  readonly successCount: number;
  readonly failureRate:  number;
  readonly successRate:  number;
  readonly avgLatencyMs: number;
  readonly maxLatencyMs: number;
  readonly availability: number;
  readonly capturedAt:   number;
}

export type OperationName =
  | "store" | "update" | "archive" | "restore" | "delete"
  | "query" | "search" | "exists" | "health";

const _counts: Record<OperationName, number> = {
  store: 0, update: 0, archive: 0, restore: 0, delete: 0,
  query: 0, search: 0, exists: 0, health: 0,
};
let _failures  = 0;
let _successes = 0;
let _totalMs   = 0;
let _maxMs     = 0;
let _samples   = 0;

export const KnowledgeStoreMetrics = {
  record(op: OperationName, ok: boolean, durationMs: number): void {
    _counts[op]++;
    if (ok) { _successes++; } else { _failures++; }
    _totalMs += durationMs;
    if (durationMs > _maxMs) _maxMs = durationMs;
    _samples++;
  },

  snapshot(): MetricsSnapshot {
    const total    = _successes + _failures;
    const avgMs    = _samples > 0 ? Math.round(_totalMs / _samples) : 0;
    const failRate = total > 0 ? _failures / total : 0;
    return Object.freeze({
      storeCount:   _counts.store,
      updateCount:  _counts.update,
      archiveCount: _counts.archive,
      restoreCount: _counts.restore,
      deleteCount:  _counts.delete,
      queryCount:   _counts.query,
      searchCount:  _counts.search,
      existsCount:  _counts.exists,
      healthCount:  _counts.health,
      totalOps:     total,
      failureCount: _failures,
      successCount: _successes,
      failureRate:  failRate,
      successRate:  total > 0 ? _successes / total : 1,
      avgLatencyMs: avgMs,
      maxLatencyMs: _maxMs,
      availability: total > 0 ? _successes / total : 1,
      capturedAt:   Date.now(),
    });
  },

  // EF-39.1: no "as any" — iterate typed keys directly
  reset(): void {
    const keys: OperationName[] = ["store","update","archive","restore","delete","query","search","exists","health"];
    keys.forEach(k => { _counts[k] = 0; });
    _failures = 0; _successes = 0; _totalMs = 0; _maxMs = 0; _samples = 0;
  },
};