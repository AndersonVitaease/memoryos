/**
 * EngineeringMemory.ts — Sprint 6.2.0
 * 2026-07-14
 *
 * Persistent in-session store for all engineering artifacts produced by the
 * EngineeringOrchestrator. Queryable by type, component, date, or keyword.
 */

export type MemoryEntryType =
  | "approved_plan"
  | "rejected_plan"
  | "completed_work"
  | "engineering_report"
  | "regression"
  | "architectural_decision"
  | "performance_record"
  | "validation_record"
  | "optimization_report";

export interface MemoryEntry {
  id: string;
  type: MemoryEntryType;
  timestamp: number;
  objective: string;
  summary: string;
  tags: string[];           // component names, layer names, etc.
  payload: Record<string, unknown>;
}

export interface MemoryQueryResult {
  entries: MemoryEntry[];
  total: number;
  queryMs: number;
}

let _seq = 0;
function makeMemId(): string {
  return `mem_${Date.now()}_${++_seq}`;
}

export class EngineeringMemory {
  private readonly _store: MemoryEntry[] = [];

  // ── Write ─────────────────────────────────────────────────────────────────

  record(
    type: MemoryEntryType,
    objective: string,
    summary: string,
    tags: string[],
    payload: Record<string, unknown>,
  ): MemoryEntry {
    const entry: MemoryEntry = {
      id:        makeMemId(),
      type,
      timestamp: Date.now(),
      objective,
      summary,
      tags,
      payload,
    };
    this._store.push(entry);
    return entry;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  query(filter: {
    type?:      MemoryEntryType;
    keyword?:   string;
    tag?:       string;
    since?:     number;   // timestamp ms
    limit?:     number;
  }): MemoryQueryResult {
    const t0 = Date.now();
    const limit = filter.limit ?? 50;

    let results = [...this._store];

    if (filter.type)    results = results.filter(e => e.type === filter.type);
    if (filter.tag)     results = results.filter(e => e.tags.some(t => t.toLowerCase().includes(filter.tag!.toLowerCase())));
    if (filter.since)   results = results.filter(e => e.timestamp >= filter.since!);
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      results = results.filter(e =>
        e.objective.toLowerCase().includes(kw) ||
        e.summary.toLowerCase().includes(kw) ||
        e.tags.some(t => t.toLowerCase().includes(kw))
      );
    }

    results = results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);

    return { entries: results, total: results.length, queryMs: Date.now() - t0 };
  }

  // ── Convenience accessors ─────────────────────────────────────────────────

  getApprovedPlans():    MemoryEntry[] { return this.query({ type: "approved_plan" }).entries; }
  getRejectedPlans():    MemoryEntry[] { return this.query({ type: "rejected_plan" }).entries; }
  getCompletedWork():    MemoryEntry[] { return this.query({ type: "completed_work" }).entries; }
  getReports():          MemoryEntry[] { return this.query({ type: "engineering_report" }).entries; }
  getRegressions():      MemoryEntry[] { return this.query({ type: "regression" }).entries; }
  getOptimizations():    MemoryEntry[] { return this.query({ type: "optimization_report" }).entries; }

  stats(): {
    total: number;
    byType: Record<string, number>;
    oldestMs: number | null;
    newestMs: number | null;
  } {
    const byType: Record<string, number> = {};
    for (const e of this._store) byType[e.type] = (byType[e.type] ?? 0) + 1;
    return {
      total:    this._store.length,
      byType,
      oldestMs: this._store.length ? this._store[0].timestamp : null,
      newestMs: this._store.length ? this._store[this._store.length - 1].timestamp : null,
    };
  }

  all(): MemoryEntry[] { return [...this._store].reverse(); }
}