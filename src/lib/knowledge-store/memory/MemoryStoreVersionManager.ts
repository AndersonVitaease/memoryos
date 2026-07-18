// MemoryStoreVersionManager.ts — Sprint EF-39.1
// Immutable version history per record.
//
// ARCHITECTURAL NOTE — EF-39.1:
// CURRENT IMPLEMENTATION: stores full record snapshots per version (O(n) memory per record).
// FUTURE IMPLEMENTATION: switch to incremental diff storage (delta/patch per version)
// to reduce memory usage for large stores. API contract (getHistory, getVersion, latest)
// must remain identical after that refactor.

import type { KnowledgeRecord } from "../KnowledgeStoreTypes";

export interface VersionEntry {
  readonly version:   number;
  readonly record:    KnowledgeRecord;
  readonly createdAt: number;
}

export class MemoryStoreVersionManager {
  // recordId → ordered list of versions (oldest first)
  private readonly _history = new Map<string, VersionEntry[]>();

  push(record: KnowledgeRecord): void {
    const list = this._history.get(record.id) ?? [];
    list.push(Object.freeze({ version: record.version, record, createdAt: Date.now() }));
    this._history.set(record.id, list);
  }

  getHistory(id: string): readonly VersionEntry[] {
    return Object.freeze([...(this._history.get(id) ?? [])]);
  }

  getVersion(id: string, version: number): KnowledgeRecord | undefined {
    return this._history.get(id)?.find(e => e.version === version)?.record;
  }

  latest(id: string): KnowledgeRecord | undefined {
    const list = this._history.get(id);
    return list && list.length > 0 ? list[list.length - 1].record : undefined;
  }

  versionCount(id: string): number {
    return this._history.get(id)?.length ?? 0;
  }

  remove(id: string): void {
    this._history.delete(id);
  }

  stats() {
    let total = 0;
    this._history.forEach(list => { total += list.length; });
    const count = this._history.size;
    return Object.freeze({ recordsWithHistory: count, totalVersions: total, avgVersions: count > 0 ? total / count : 0 });
  }

  allIds(): string[] { return [...this._history.keys()]; }
}