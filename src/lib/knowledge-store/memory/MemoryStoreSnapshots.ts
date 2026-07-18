// MemoryStoreSnapshots.ts — Sprint EF-39
// Immutable read-only snapshots of store state.

import type { KnowledgeRecord } from "../KnowledgeStoreTypes";
import type { StoreStatisticsSnapshot } from "./MemoryStoreStatistics";

export interface StoreSnapshot {
  readonly id:         string;
  readonly takenAt:    number;
  readonly recordCount:number;
  readonly records:    readonly KnowledgeRecord[];
  readonly statistics: StoreStatisticsSnapshot;
  readonly indexStats: Record<string, number>;
  readonly label?:     string;
}

let _seq = 0;

export class MemoryStoreSnapshots {
  private readonly _snapshots = new Map<string, StoreSnapshot>();

  take(params: {
    records:    KnowledgeRecord[];
    statistics: StoreStatisticsSnapshot;
    indexStats: Record<string, number>;
    label?:     string;
  }): StoreSnapshot {
    const id  = `snap-${Date.now()}-${++_seq}`;
    const snap: StoreSnapshot = Object.freeze({
      id,
      takenAt:     Date.now(),
      recordCount: params.records.length,
      records:     Object.freeze([...params.records]),
      statistics:  params.statistics,
      indexStats:  Object.freeze({ ...params.indexStats }),
      label:       params.label,
    });
    this._snapshots.set(id, snap);
    return snap;
  }

  get(id: string): StoreSnapshot | undefined {
    return this._snapshots.get(id);
  }

  listAll(): StoreSnapshot[] {
    return [...this._snapshots.values()].sort((a, b) => b.takenAt - a.takenAt);
  }

  latest(): StoreSnapshot | undefined {
    const all = this.listAll();
    return all.length > 0 ? all[0] : undefined;
  }

  delete(id: string): void {
    this._snapshots.delete(id);
  }

  size(): number { return this._snapshots.size; }
}