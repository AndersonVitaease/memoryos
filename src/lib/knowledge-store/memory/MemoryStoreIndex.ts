// MemoryStoreIndex.ts — Sprint EF-39.1 (hardened)
// Maintains O(1) lookup indexes for all record dimensions.
// EF-39.1: update() now correctly handles ALL index dimensions (type, source, conversationId, date).
// EF-39.1: _setDel() auto-removes empty Sets so no index ever contains stale empty sets.

import type { KnowledgeRecord, KnowledgeRecordStatus } from "../KnowledgeStoreTypes";
import type { MemoryType } from "@/lib/ingestion/KipTypes";

export class MemoryStoreIndex {
  private readonly _byId      = new Map<string, string>();
  private readonly _byType    = new Map<MemoryType, Set<string>>();
  private readonly _byStatus  = new Map<KnowledgeRecordStatus, Set<string>>();
  private readonly _byTag     = new Map<string, Set<string>>();
  private readonly _bySource  = new Map<string, Set<string>>();
  private readonly _byConv    = new Map<string, Set<string>>();
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

  // EF-39.1: fully update ALL dimensions that may have changed between prev and next.
  update(prev: KnowledgeRecord, next: KnowledgeRecord): void {
    // status
    if (prev.status !== next.status) {
      this._setDel(this._byStatus, prev.status, prev.id);
      this._setAdd(this._byStatus, next.status, next.id);
    }

    // type
    if (prev.type !== next.type) {
      this._setDel(this._byType, prev.type, prev.id);
      this._setAdd(this._byType, next.type, next.id);
    }

    // source
    if (prev.evidence.source !== next.evidence.source) {
      this._setDel(this._bySource, prev.evidence.source, prev.id);
      this._setAdd(this._bySource, next.evidence.source, next.id);
    }

    // conversationId
    if (prev.evidence.conversationId !== next.evidence.conversationId) {
      this._setDel(this._byConv, prev.evidence.conversationId, prev.id);
      this._setAdd(this._byConv, next.evidence.conversationId, next.id);
    }

    // EF-39.2: resilient date index update — handles any case where createdAt differs
    if (prev.createdAt !== next.createdAt) {
      this._setDel(this._byDate, this._dateKey(prev.createdAt), prev.id);
      this._setAdd(this._byDate, this._dateKey(next.createdAt), next.id);
    }

    // tags diff
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
      totalIds:  this._byId.size,
      types:     this._byType.size,
      statuses:  this._byStatus.size,
      tags:      this._byTag.size,
      sources:   this._bySource.size,
      convs:     this._byConv.size,
      dates:     this._byDate.size,
    });
  }

  private _setAdd<K>(map: Map<K, Set<string>>, key: K, id: string) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(id);
  }

  // EF-39.1: auto-remove the Map entry when the Set becomes empty.
  private _setDel<K>(map: Map<K, Set<string>>, key: K, id: string) {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }
}