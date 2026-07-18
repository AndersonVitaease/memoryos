// KnowledgeStoreFacade.ts — Sprint EF-38.1
// The OFFICIAL public API for knowledge storage in MemoryOS.
// Every component depends on this facade — never on IKnowledgeStore directly.
// The facade never knows which storage engine is active.

import type { IKnowledgeStore } from "./IKnowledgeStore";
import type {
  KnowledgeRecordDraft, KnowledgeRecordPatch,
  KnowledgeQuery, KnowledgeSearchQuery,
  StoreResult, GetResult, QueryResult, SearchResult,
  ExistsResult, DeleteResult, ArchiveResult, RestoreResult,
  StoreStats, HealthResult,
} from "./KnowledgeStoreTypes";
import { KnowledgeStoreMiddleware }    from "./KnowledgeStoreMiddleware";
import { KnowledgeStoreMetrics }       from "./KnowledgeStoreMetrics";
import { KnowledgeStoreHealthMonitor } from "./KnowledgeStoreHealthMonitor";
import { KnowledgeStoreEventBus }      from "./KnowledgeStoreEvents";
import { KnowledgeStoreProvider }      from "./KnowledgeStoreProvider";

function getStore(): IKnowledgeStore {
  return KnowledgeStoreProvider.getStore();
}

async function run<T extends { ok: boolean }>(
  op: Parameters<typeof KnowledgeStoreMiddleware.createContext>[0],
  payload: unknown,
  fn: (store: IKnowledgeStore) => Promise<T>,
  callerTag?: string,
): Promise<T> {
  const ctx = KnowledgeStoreMiddleware.createContext(op, payload, callerTag);
  const mw  = KnowledgeStoreMiddleware.run(ctx);

  if (!mw.ok || mw.blocked) {
    const err = Object.freeze({ ok: false, error: mw.blockReason ?? "Middleware blocked" }) as unknown as T;
    KnowledgeStoreMetrics.record(op as any, false, 0);
    KnowledgeStoreEventBus.emit("STORE_ERROR", "facade", { meta: { reason: mw.blockReason, op } });
    return err;
  }

  const t0 = Date.now();
  const result = await fn(getStore());
  const ms = Date.now() - t0;

  KnowledgeStoreMetrics.record(op as any, result.ok, ms);
  KnowledgeStoreHealthMonitor.record(ms, result.ok);

  if (!result.ok) {
    KnowledgeStoreEventBus.emit("STORE_ERROR", "facade", { meta: { op, durationMs: ms } });
  }

  return result;
}

export const KnowledgeStoreFacade = {
  /** Persist a new knowledge record. */
  store(draft: KnowledgeRecordDraft, callerTag?: string): Promise<StoreResult> {
    return run("store", draft, s => s.store(draft), callerTag);
  },

  /** Update an existing record. */
  update(id: string, patch: KnowledgeRecordPatch, callerTag?: string): Promise<StoreResult> {
    return run("update", patch, s => s.update(id, patch), callerTag);
  },

  /** Soft-delete — archive preserves history. */
  archive(id: string, reason?: string, callerTag?: string): Promise<ArchiveResult> {
    return run("archive", { id }, s => s.archive(id, reason), callerTag);
  },

  /** Restore an archived record. */
  restore(id: string, callerTag?: string): Promise<RestoreResult> {
    return run("restore", { id }, s => s.restore(id), callerTag);
  },

  /** Permanent deletion — irreversible. */
  delete(id: string, callerTag?: string): Promise<DeleteResult> {
    return run("delete", { id }, s => s.delete(id), callerTag);
  },

  /** Check if a record exists. */
  exists(id: string, callerTag?: string): Promise<ExistsResult> {
    return run("exists", { id }, s => s.exists(id), callerTag);
  },

  /** Get a single record by id. */
  get(id: string, callerTag?: string): Promise<GetResult> {
    return run("get", { id }, s => s.get(id), callerTag);
  },

  /** Full-text or semantic search. */
  search(query: KnowledgeSearchQuery, callerTag?: string): Promise<SearchResult> {
    return run("search", query, s => s.search(query), callerTag);
  },

  /** Structured query with filters and pagination. */
  query(query: KnowledgeQuery, callerTag?: string): Promise<QueryResult> {
    return run("query", query, s => s.query(query), callerTag);
  },

  /** Aggregate store statistics. */
  async stats(): Promise<StoreStats> {
    const t0 = Date.now();
    const result = await getStore().stats();
    KnowledgeStoreMetrics.record("health" as any, true, Date.now() - t0);
    KnowledgeStoreEventBus.emit("STATS_QUERIED", "facade");
    return result;
  },

  /** Health check. */
  async health(): Promise<HealthResult> {
    const t0 = Date.now();
    const result = await getStore().health();
    const ms = Date.now() - t0;
    KnowledgeStoreMetrics.record("health", result.ok, ms);
    KnowledgeStoreHealthMonitor.record(ms, result.ok);
    KnowledgeStoreEventBus.emit("HEALTH_CHECKED", "facade", { durationMs: ms });
    return result;
  },

  /** Current metrics snapshot. */
  metrics() { return KnowledgeStoreMetrics.snapshot(); },

  /** Current health snapshot. */
  healthSnapshot() { return KnowledgeStoreHealthMonitor.snapshot(); },

  /** Current provider state. */
  providerState() { return KnowledgeStoreProvider.state(); },
};