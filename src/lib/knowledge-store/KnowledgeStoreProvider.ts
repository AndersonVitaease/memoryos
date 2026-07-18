// KnowledgeStoreProvider.ts — Sprint EF-38.1
// Singleton lifecycle, lazy initialization, safe runtime replacement.
// Guarantees exactly one store instance at runtime.

import type { IKnowledgeStore, KnowledgeStoreConfig } from "./IKnowledgeStore";
import type { EngineId, EngineEnvironment } from "./KnowledgeStoreRegistry";
import { KnowledgeStoreResolver } from "./KnowledgeStoreResolver";
import { KnowledgeStoreHealthMonitor } from "./KnowledgeStoreHealthMonitor";

export interface ProviderState {
  readonly initialized:  boolean;
  readonly engineId:     EngineId | null;
  readonly environment:  EngineEnvironment;
  readonly config:       KnowledgeStoreConfig | null;
  readonly initializedAt: number | null;
}

let _store:       IKnowledgeStore | null = null;
let _engineId:    EngineId | null        = null;
let _environment: EngineEnvironment      = "development";
let _config:      KnowledgeStoreConfig | null = null;
let _initAt:      number | null          = null;

// Factory registry — injected at app boot, never imported directly
const _factories = new Map<EngineId, () => IKnowledgeStore>();

export const KnowledgeStoreProvider = {
  /**
   * Register a factory for an engine id.
   * Called at application bootstrap — never in domain logic.
   */
  registerFactory(engineId: EngineId, factory: () => IKnowledgeStore): void {
    _factories.set(engineId, factory);
  },

  /**
   * Configure provider before first use.
   */
  configure(environment: EngineEnvironment, config?: Partial<KnowledgeStoreConfig>): void {
    _environment = environment;
    const resolved = KnowledgeStoreResolver.resolve({ environment, override: config?.engine as EngineId | undefined });
    _engineId = resolved.engineId;
    _config   = Object.freeze({ engine: _engineId ?? "memory", ...config }) as KnowledgeStoreConfig;
    KnowledgeStoreHealthMonitor.setEngine(_engineId ?? "none");
  },

  /**
   * Returns the singleton store instance (lazy init).
   * Throws only if no factory is registered — programming error.
   */
  getStore(): IKnowledgeStore {
    if (_store) return _store;

    const engineId = _engineId ?? "memory";
    const factory  = _factories.get(engineId);

    if (!factory) {
      // No concrete implementation registered yet — return a no-op stub
      // that satisfies the interface during EF-38.1 (contract-only sprint)
      _store   = createNullStore(engineId);
      _initAt  = Date.now();
      return _store;
    }

    _store  = factory();
    _initAt = Date.now();
    return _store;
  },

  /**
   * Replace the active store with a new implementation (safe swap).
   * Used for testing and runtime engine switching.
   */
  replace(store: IKnowledgeStore, engineId?: EngineId): void {
    _store   = store;
    if (engineId) _engineId = engineId;
    _initAt  = Date.now();
    KnowledgeStoreHealthMonitor.setEngine(engineId ?? _engineId ?? "custom");
  },

  /**
   * Reset to uninitialized state (testing only).
   */
  reset(): void {
    _store    = null;
    _engineId = null;
    _config   = null;
    _initAt   = null;
    _environment = "development";
    _factories.clear();
    KnowledgeStoreHealthMonitor.reset();
  },

  state(): ProviderState {
    return Object.freeze({
      initialized:   _store !== null,
      engineId:      _engineId,
      environment:   _environment,
      config:        _config,
      initializedAt: _initAt,
    });
  },
};

// ── Null store stub (EF-38.1 only — no implementation exists yet) ─────────────
function createNullStore(engineId: string): IKnowledgeStore {
  const notImpl = (op: string) => Promise.resolve(Object.freeze({ ok: false, error: `No ${engineId} implementation registered yet (EF-38.1 contract-only sprint)`, id: "", version: 0, exists: false, deleted: false, archived: false, restored: false, records: [], scores: [], total: 0, hasMore: false, status: "unavailable", latencyMs: 0, storageEngine: engineId })) as any;
  return {
    store:   () => notImpl("store"),
    update:  () => notImpl("update"),
    archive: () => notImpl("archive"),
    restore: () => notImpl("restore"),
    delete:  () => notImpl("delete"),
    exists:  () => notImpl("exists"),
    get:     () => notImpl("get"),
    search:  () => notImpl("search"),
    query:   () => notImpl("query"),
    stats:   () => Promise.resolve(Object.freeze({ totalRecords: 0, activeRecords: 0, archivedRecords: 0, totalSources: 0, storageEngine: engineId, version: "EF-38.1" })),
    health:  () => Promise.resolve(Object.freeze({ ok: false, status: "unavailable" as const, latencyMs: 0, storageEngine: engineId, details: "No implementation registered" })),
  };
}