// MemoryStoreIndex.ts — Sprint EF-39
// Maintains O(1) lookup indexes for all record dimensions.

import type { KnowledgeRecord, KnowledgeRecordStatus } from "../KnowledgeStoreTypes";
import type { MemoryType } from "@/lib/ingestion/KipTypes";

export class MemoryStoreIndex {
  // id → record id (identity; primary key)
  private readonly _byId      = new Map<string, string>();
  // type → Set<id>
  private readonly _byType    = new Map<MemoryType, Set<string>>();
  // status → Set<id>
  private readonly _byStatus  = new Map<KnowledgeRecordStatus, Set<string>>();
  // tag → Set<id>
  private readonly _byTag     = new Map<string, Set<string>>();
  // source → Set<id>
  private readonly _bySource  = new Map<string, Set<string>>();
  // conversationId → Set<id>
  private readonly _byConv    = new Map<string, Set<string>>();
  // dateKey (YYYY-MM-DD) → Set<id>
  private readonly _byDate    = new Map<string, Set<string>>();

  private _dateKey(ts: number) { return new Date(ts).toISOString().slice(0, 10); }

  add(r: KnowledgeRecord): void {
    this._byId.set(r.id, r.id);
    this._setAdd(this._byType,   r.type,                      r.id);
    this._setAdd(this._byStatus, r.status,                    r.id);
    this._setAdd(this._bySource, r.evidence.source,           r.id);
    this._setAdd(this._byConv,   r.evidence.conversationId,   r.id);
    this._setAdd(this._byDate,   this._dateKey(r.createdAt),  r.id);
    r.tags.forEach(t => this._setAdd(this._byTag, t, r.id));
  }

  update(prev: KnowledgeRecord, next: KnowledgeRecord): void {
    // Remove old status/type/tag/date, add new
    this._setDel(this._byStatus, prev.status, prev.id);
    this._setAdd(this._byStatus, next.status, next.id);
    // Tags diff
    const prevTags = new Set(prev.tags);
    const nextTags = new Set(next.tags);
    prevTags.forEach(t => { if (!nextTags.has(t)) this._setDel(this._byTag, t, prev.id); });
    nextTags.forEach(t => { if (!prevTags.has(t)) this._setAdd(this._byTag, t, next.id); });
  }

  remove(r: KnowledgeRecord): void {
    this._byId.delete(r.id);
    this._setDel(this._byType,   r.type,                    r.id);
    this._setDel(this._byStatus, r.status,                  r.id);
    this._setDel(this._bySource, r.evidence.source,         r.id);
    this._setDel(this._byConv,   r.evidence.conversationId, r.id);
    this._setDel(this._byDate,   this._dateKey(r.createdAt),r.id);
    r.tags.forEach(t => this._setDel(this._byTag, t, r.id));
  }

  hasId(id: string):    boolean      { return this._byId.has(id); }
  byType(t: MemoryType):  Set<string> { return new Set(this._byType.get(t) ?? []); }
  byStatus(s: KnowledgeRecordStatus): Set<string> { return new Set(this._byStatus.get(s) ?? []); }
  byTag(tag: string):   Set<string>  { return new Set(this._byTag.get(tag) ?? []); }
  bySource(s: string):  Set<string>  { return new Set(this._bySource.get(s) ?? []); }
  byConv(c: string):    Set<string>  { return new Set(this._byConv.get(c) ?? []); }
  byDate(d: string):    Set<string>  { return new Set(this._byDate.get(d) ?? []); }
  allIds():             string[]     { return [...this._byId.keys()]; }
  size():               number       { return this._byId.size; }

  stats() {
    return Object.freeze({
      totalIds:    this._byId.size,
      types:       this._byType.size,
      statuses:    this._byStatus.size,
      tags:        this._byTag.size,
      sources:     this._bySource.size,
      convs:       this._byConv.size,
      dates:       this._byDate.size,
    });
  }

  private _setAdd<K>(map: Map<K, Set<string>>, key: K, id: string) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(id);
  }
  private _setDel<K>(map: Map<K, Set<string>>, key: K, id: string) {
    map.get(key)?.delete(id);
  }
}