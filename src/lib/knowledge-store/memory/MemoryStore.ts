// MemoryStore.ts — Sprint EF-39
// Reference implementation of IKnowledgeStore.
// This is the canonical behavior specification for all future storage engines.

import type { IKnowledgeStore } from "../IKnowledgeStore";
import type {
  KnowledgeRecord, KnowledgeRecordDraft, KnowledgeRecordPatch,
  KnowledgeQuery, KnowledgeSearchQuery,
  StoreResult, GetResult, QueryResult, SearchResult,
  ExistsResult, DeleteResult, ArchiveResult, RestoreResult,
  StoreStats, HealthResult,
} from "../KnowledgeStoreTypes";
import { KnowledgeStoreValidation } from "../KnowledgeStoreValidation";
import { KnowledgeStoreEventBus }   from "../KnowledgeStoreEvents";
import { KnowledgeStoreMetrics }    from "../KnowledgeStoreMetrics";
import { MemoryStoreIndex }         from "./MemoryStoreIndex";
import { MemoryStoreVersionManager }from "./MemoryStoreVersionManager";
import { MemoryStoreArchive }       from "./MemoryStoreArchive";
import { MemoryStoreQuery }         from "./MemoryStoreQuery";
import { MemoryStoreSearch }        from "./MemoryStoreSearch";
import { MemoryStoreStatistics }    from "./MemoryStoreStatistics";
import { MemoryStoreSnapshots }     from "./MemoryStoreSnapshots";

const ENGINE = "memory";
let _seq = 0;
const uid = () => `mem-${Date.now()}-${++_seq}`;

export class MemoryStore implements IKnowledgeStore {
  private readonly _records    = new Map<string, KnowledgeRecord>();
  private readonly _index      = new MemoryStoreIndex();
  private readonly _versions   = new MemoryStoreVersionManager();
  private readonly _archive    = new MemoryStoreArchive();
  private readonly _stats      = new MemoryStoreStatistics();
  private readonly _snapshots  = new MemoryStoreSnapshots();
  private readonly _startedAt  = Date.now();

  // ── store() ────────────────────────────────────────────────────────────────
  async store(draft: KnowledgeRecordDraft): Promise<StoreResult> {
    const v = KnowledgeStoreValidation.validateDraft(draft);
    if (!v.valid) return Object.freeze({ ok: false, id: "", version: 0, error: v.errors[0].message });

    const t0  = Date.now();
    const id  = uid();
    const now = Date.now();
    const record: KnowledgeRecord = Object.freeze({
      id,
      type:      draft.type,
      content:   draft.content,
      version:   1,
      summary:   draft.summary ?? "",
      tags:      Object.freeze([...(draft.tags ?? [])]),
      evidence:  draft.evidence,
      status:    "active",
      createdAt: now,
      updatedAt: now,
    });

    this._records.set(id, record);
    this._index.add(record);
    this._versions.push(record);
    this._stats.onStore();

    KnowledgeStoreEventBus.emit("RECORD_STORED", ENGINE, { recordId: id, durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("store", true, Date.now() - t0);

    return Object.freeze({ ok: true, id, version: 1, record });
  }

  // ── update() ───────────────────────────────────────────────────────────────
  async update(id: string, patch: KnowledgeRecordPatch): Promise<StoreResult> {
    const existing = this._records.get(id);
    if (!existing) return Object.freeze({ ok: false, id, version: 0, error: `NOT_FOUND: ${id}` });
    if (existing.status === "archived") return Object.freeze({ ok: false, id, version: 0, error: `ARCHIVED: ${id}` });
    if (existing.status === "deleted")  return Object.freeze({ ok: false, id, version: 0, error: `DELETED: ${id}` });

    const v = KnowledgeStoreValidation.validatePatch(patch);
    if (!v.valid) return Object.freeze({ ok: false, id, version: 0, error: v.errors[0].message });

    const t0 = Date.now();
    const updated: KnowledgeRecord = Object.freeze({
      ...existing,
      content:   patch.content  ?? existing.content,
      summary:   patch.summary  ?? existing.summary,
      tags:      Object.freeze(patch.tags ?? [...existing.tags]),
      status:    patch.status   ?? existing.status,
      version:   existing.version + 1,
      updatedAt: Date.now(),
    });

    this._index.update(existing, updated);
    this._records.set(id, updated);
    this._versions.push(updated);
    this._stats.onUpdate();

    KnowledgeStoreEventBus.emit("RECORD_UPDATED", ENGINE, { recordId: id, durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("store", true, Date.now() - t0);

    return Object.freeze({ ok: true, id, version: updated.version, record: updated });
  }

  // ── archive() ──────────────────────────────────────────────────────────────
  async archive(id: string, reason?: string): Promise<ArchiveResult> {
    const existing = this._records.get(id);
    if (!existing) return Object.freeze({ ok: false, archived: false, error: `NOT_FOUND: ${id}` });
    if (existing.status === "archived") return Object.freeze({ ok: true, archived: true, record: existing });

    const t0 = Date.now();
    const archived: KnowledgeRecord = Object.freeze({
      ...existing, status: "archived", updatedAt: Date.now()
    });

    this._index.update(existing, archived);
    this._records.set(id, archived);
    this._archive.add(archived, reason);
    this._versions.push(archived);
    this._stats.onArchive();

    KnowledgeStoreEventBus.emit("RECORD_ARCHIVED", ENGINE, { recordId: id, durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("archive", true, Date.now() - t0);

    return Object.freeze({ ok: true, archived: true, record: archived });
  }

  // ── restore() ──────────────────────────────────────────────────────────────
  async restore(id: string): Promise<RestoreResult> {
    const existing = this._records.get(id);
    if (!existing) return Object.freeze({ ok: false, restored: false, error: `NOT_FOUND: ${id}` });
    if (existing.status !== "archived") return Object.freeze({ ok: false, restored: false, error: `NOT_ARCHIVED: ${id}` });

    const t0 = Date.now();
    const restored: KnowledgeRecord = Object.freeze({
      ...existing, status: "active", updatedAt: Date.now()
    });

    this._index.update(existing, restored);
    this._records.set(id, restored);
    this._archive.remove(id);
    this._versions.push(restored);
    this._stats.onRestore();

    KnowledgeStoreEventBus.emit("RECORD_RESTORED", ENGINE, { recordId: id, durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("restore", true, Date.now() - t0);

    return Object.freeze({ ok: true, restored: true, record: restored });
  }

  // ── delete() ───────────────────────────────────────────────────────────────
  async delete(id: string): Promise<DeleteResult> {
    const existing = this._records.get(id);
    if (!existing) return Object.freeze({ ok: true, deleted: false });

    const t0 = Date.now();
    const wasArchived = existing.status === "archived";

    this._index.remove(existing);
    this._records.delete(id);
    this._versions.remove(id);
    this._archive.delete(id);
    this._stats.onDelete(wasArchived);

    KnowledgeStoreEventBus.emit("RECORD_DELETED", ENGINE, { recordId: id, durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("delete", true, Date.now() - t0);

    return Object.freeze({ ok: true, deleted: true });
  }

  // ── exists() ───────────────────────────────────────────────────────────────
  async exists(id: string): Promise<ExistsResult> {
    const exists = this._index.hasId(id);
    KnowledgeStoreMetrics.record("exists", true, 0);
    return Object.freeze({ ok: true, exists, id: exists ? id : undefined });
  }

  // ── get() ──────────────────────────────────────────────────────────────────
  async get(id: string): Promise<GetResult> {
    const record = this._records.get(id);
    KnowledgeStoreEventBus.emit("RECORD_QUERIED", ENGINE, { recordId: id });
    KnowledgeStoreMetrics.record("query", true, 0);
    return Object.freeze({ ok: true, record });
  }

  // ── search() ───────────────────────────────────────────────────────────────
  async search(query: KnowledgeSearchQuery): Promise<SearchResult> {
    const v = KnowledgeStoreValidation.validateSearchQuery(query);
    if (!v.valid) return Object.freeze({ ok: false, records: [], scores: [], total: 0, error: v.errors[0].message });

    const t0 = Date.now();
    const result = MemoryStoreSearch.execute([...this._records.values()], query);
    this._stats.onSearch();

    KnowledgeStoreEventBus.emit("RECORD_SEARCHED", ENGINE, { durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("search", true, Date.now() - t0);

    return result;
  }

  // ── query() ────────────────────────────────────────────────────────────────
  async query(query: KnowledgeQuery): Promise<QueryResult> {
    const v = KnowledgeStoreValidation.validateQuery(query);
    if (!v.valid) return Object.freeze({ ok: false, records: [], total: 0, hasMore: false, error: v.errors[0].message });

    const t0 = Date.now();
    const result = MemoryStoreQuery.execute([...this._records.values()], query);
    this._stats.onQuery();

    KnowledgeStoreEventBus.emit("RECORD_QUERIED", ENGINE, { durationMs: Date.now() - t0 });
    KnowledgeStoreMetrics.record("query", true, Date.now() - t0);

    return result;
  }

  // ── stats() ────────────────────────────────────────────────────────────────
  async stats(): Promise<StoreStats> {
    const snap  = this._stats.snapshot();
    const vSnap = this._versions.stats();
    KnowledgeStoreEventBus.emit("STATS_QUERIED", ENGINE);
    return Object.freeze({
      totalRecords:    snap.totalRecords,
      activeRecords:   snap.activeRecords,
      archivedRecords: snap.archivedRecords,
      totalSources:    this._index.stats().sources,
      storageEngine:   ENGINE,
      version:         "EF-39.0",
    });
  }

  // ── health() ───────────────────────────────────────────────────────────────
  async health(): Promise<HealthResult> {
    const latencyMs = Date.now() - this._startedAt > 0 ? 0 : 0;
    KnowledgeStoreEventBus.emit("HEALTH_CHECKED", ENGINE, { durationMs: latencyMs });
    KnowledgeStoreMetrics.record("health", true, latencyMs);
    return Object.freeze({
      ok:            true,
      status:        "healthy",
      latencyMs,
      storageEngine: ENGINE,
      details:       `${this._records.size} records · ${this._archive.size()} archived · uptime ${Date.now() - this._startedAt}ms`,
    });
  }

  // ── Extension methods (not on IKnowledgeStore) ────────────────────────────
  takeSnapshot(label?: string) {
    return this._snapshots.take({
      records:    [...this._records.values()],
      statistics: this._stats.snapshot(),
      indexStats: this._index.stats() as any,
      label,
    });
  }

  getSnapshot(id: string) { return this._snapshots.get(id); }
  listSnapshots()         { return this._snapshots.listAll(); }
  getVersionHistory(id: string) { return this._versions.getHistory(id); }
  getRecordVersion(id: string, version: number) { return this._versions.getVersion(id, version); }
  listArchived()          { return this._archive.listAll(); }
  internalStats()         { return this._stats.snapshot(); }
  indexStats()            { return this._index.stats(); }
  recordCount()           { return this._records.size; }
}