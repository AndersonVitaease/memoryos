/**
 * KnowledgeGraphStore.ts — EF-60.1.1 / 60.1.6 / 60.4.1-60.4.7
 * Phase 6.0.4 · MemoryOS · 2026-07-14
 *
 * Module-scoped singleton anchored to globalThis to survive Vite HMR
 * re-evaluations. Every module that imports this file gets THE SAME object.
 *
 * EF-60.4.1 — Exactly one instance across the entire application lifetime.
 * EF-60.4.2 — Unique instanceId + creation/update timestamps.
 * EF-60.4.3 — Full operation trace (set/get/query/clear).
 * EF-60.4.5 — Duplicate instance detection.
 * EF-60.4.6 — HMR / module-reload detection.
 *
 * Architectural rule: only RepositoryKnowledgeBuilder calls set(). All others: read-only.
 */

import type { ProjectKnowledgeGraph, KnowledgeQueryResult, ArchEntity } from "./PKBTypes";

// ── Operation trace entry ─────────────────────────────────────────────────────

export interface KGSOperation {
  id:        number;
  op:        "created" | "set" | "get" | "query" | "queryByKeyword" | "listAllEntities" | "clear" | "hmr_reuse";
  timestamp: number;
  caller?:   string;
  detail?:   string;
}

// ── Singleton state stored on globalThis ─────────────────────────────────────

const GLOBAL_KEY = "__memoryos_kgs__";

interface GlobalKGSState {
  instanceId:     string;
  createdAt:      number;
  graph:          ProjectKnowledgeGraph | null;
  builtAt:        number;
  lastWrittenBy:  string;
  lastReadBy:     string;
  lastReadAt:     number;
  setCount:       number;
  getCount:       number;
  queryCount:     number;
  incrementalUpdates: number;
  operations:     KGSOperation[];
  opSeq:          number;
  duplicateCount: number;
}

function makeInstanceId(): string {
  return `kgs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function getGlobalState(): GlobalKGSState {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      instanceId:     makeInstanceId(),
      createdAt:      Date.now(),
      graph:          null,
      builtAt:        0,
      lastWrittenBy:  "none",
      lastReadBy:     "none",
      lastReadAt:     0,
      setCount:       0,
      getCount:       0,
      queryCount:     0,
      incrementalUpdates: 0,
      operations:     [],
      opSeq:          0,
      duplicateCount: 0,
    } satisfies GlobalKGSState;
    pushOp(g[GLOBAL_KEY], "created", undefined, `instanceId=${g[GLOBAL_KEY].instanceId}`);
  }
  return g[GLOBAL_KEY] as GlobalKGSState;
}

function pushOp(state: GlobalKGSState, op: KGSOperation["op"], caller?: string, detail?: string): void {
  state.operations.push({ id: ++state.opSeq, op, timestamp: Date.now(), caller, detail });
  // Keep last 200 operations
  if (state.operations.length > 200) state.operations.splice(0, state.operations.length - 200);
}

// ── KnowledgeGraphStoreClass ──────────────────────────────────────────────────

class KnowledgeGraphStoreClass {
  // instanceId exposed on the class so callers can verify they share the same object
  readonly instanceId: string;

  constructor() {
    const state = getGlobalState();
    this.instanceId = state.instanceId;

    // EF-60.4.6: detect HMR — if module re-evaluated but globalThis already has state,
    // this is a reload. Record it but reuse the existing state (no data loss).
    if (state.setCount > 0 || state.graph !== null) {
      state.duplicateCount++;
      pushOp(state, "hmr_reuse", "constructor", `HMR reuse #${state.duplicateCount} — graph preserved`);
    }
  }

  // ── Write (only RepositoryKnowledgeBuilder calls this) ────────────────────

  set(graph: ProjectKnowledgeGraph, caller = "unknown"): void {
    const state = getGlobalState();
    state.graph         = graph;
    state.builtAt       = Date.now();
    state.lastWrittenBy = caller;
    state.setCount++;
    pushOp(state, "set", caller,
      `entities=${graph.entityCount} rels=${graph.relationshipCount} modules=${graph.modules.length}`);
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  get(caller = "unknown"): ProjectKnowledgeGraph | null {
    const state = getGlobalState();
    state.getCount++;
    state.lastReadBy = caller;
    state.lastReadAt = Date.now();
    pushOp(state, "get", caller, state.graph ? `entities=${state.graph.entityCount}` : "empty");
    return state.graph;
  }

  isReady(): boolean {
    const g = getGlobalState().graph;
    return g !== null && g.entityCount > 0;
  }

  builtAt(): number  { return getGlobalState().builtAt; }
  ageMs():   number  { const b = getGlobalState().builtAt; return b > 0 ? Date.now() - b : Infinity; }

  // ── Snapshot fields (EF-60.1.4) ──────────────────────────────────────────

  snapshotFields(): Record<string, unknown> {
    const g = getGlobalState().graph;
    if (!g) {
      return {
        kgReady: false, kgEntityCount: 0, kgRelationshipCount: 0, kgModuleCount: 0,
        kgCoverage: 0, kgDeadCode: 0, kgCircularDeps: 0, kgLayers: {}, kgHealth: "NOT_BUILT",
        kgInstanceId: getGlobalState().instanceId,
      };
    }
    const health =
      g.entityCount > 50  && g.relationshipCount > 20 && g.coverage > 0.5 ? "HEALTHY"
      : g.entityCount > 10 ? "PARTIAL"
      : "MINIMAL";
    return {
      kgReady:             true,
      kgEntityCount:       g.entityCount,
      kgRelationshipCount: g.relationshipCount,
      kgModuleCount:       g.modules.length,
      kgCoverage:          g.coverage,
      kgDeadCode:          g.deadCode.length,
      kgCircularDeps:      g.circularDeps.length,
      kgLayers:            Object.fromEntries(Object.entries(g.layers).map(([k, v]) => [k, v.length])),
      kgHealth:            health,
      kgBuiltAt:           g.builtAt,
      kgDurationMs:        g.durationMs,
      kgRepo:              `${g.owner}/${g.repo}`,
      kgInstanceId:        getGlobalState().instanceId,
    };
  }

  // ── Query (EF-60.1.8) ─────────────────────────────────────────────────────

  query(entityName: string, caller = "unknown"): KnowledgeQueryResult {
    const state = getGlobalState();
    state.queryCount++;
    pushOp(state, "query", caller, `symbol=${entityName}`);
    if (!state.graph) {
      return { found: false, entityName, entity: null, dependents: [], dependencies: [], relationships: [], source: "not_found", confidence: 0 };
    }
    const entity = state.graph.entities.find(e =>
      e.name.toLowerCase() === entityName.toLowerCase() ||
      e.filePath.toLowerCase().includes(entityName.toLowerCase().replace(/\s+/g, ""))
    );
    if (!entity) {
      return { found: false, entityName, entity: null, dependents: [], dependencies: [], relationships: [], source: "not_found", confidence: 0 };
    }
    const rels  = state.graph.relationships.filter(r => r.fromId === entity.id || r.toId === entity.id);
    const deps  = entity.dependencies.map(id => state.graph!.entities.find(e => e.id === id)).filter(Boolean) as ArchEntity[];
    const depts = entity.dependents.map(id => state.graph!.entities.find(e => e.id === id)).filter(Boolean) as ArchEntity[];
    return { found: true, entityName, entity, dependents: depts, dependencies: deps, relationships: rels, source: "knowledge_graph", confidence: entity.confidence };
  }

  // ── Architecture queries ──────────────────────────────────────────────────

  queryByKeyword(keyword: string, caller = "unknown"): ArchEntity[] {
    const state = getGlobalState();
    state.queryCount++;
    pushOp(state, "queryByKeyword", caller, `kw=${keyword}`);
    if (!state.graph) return [];
    const kw = keyword.toLowerCase();
    return state.graph.entities.filter(e =>
      e.name.toLowerCase().includes(kw) ||
      e.filePath.toLowerCase().includes(kw) ||
      e.responsibilities.some(r => r.toLowerCase().includes(kw))
    ).slice(0, 20);
  }

  listLayers(): Record<string, number> {
    const g = getGlobalState().graph;
    if (!g) return {};
    return Object.fromEntries(Object.entries(g.layers).map(([k, v]) => [k, v.length]));
  }

  listAllEntities(caller = "unknown"): Array<{ name: string; type: string; layer: string; filePath: string }> {
    const state = getGlobalState();
    pushOp(state, "listAllEntities", caller, `returning ${state.graph?.entityCount ?? 0} entities`);
    if (!state.graph) return [];
    return state.graph.entities.map(e => ({ name: e.name, type: e.type, layer: e.layer, filePath: e.filePath }));
  }

  detectCircularDeps(): string[][] { return getGlobalState().graph?.circularDeps ?? []; }
  detectDeadCode():    string[]    { return getGlobalState().graph?.deadCode ?? []; }

  // ── Diagnostics (EF-60.1.9 / EF-60.4.2) ─────────────────────────────────

  recordIncrementalUpdate(): void { getGlobalState().incrementalUpdates++; }

  diagnostics(): Record<string, unknown> {
    const state = getGlobalState();
    return {
      instanceId:         state.instanceId,
      createdAt:          state.createdAt,
      ready:              this.isReady(),
      entityCount:        state.graph?.entityCount ?? 0,
      relationshipCount:  state.graph?.relationshipCount ?? 0,
      moduleCount:        state.graph?.modules.length ?? 0,
      dependencyEdges:    state.graph?.relationships.length ?? 0,
      coverage:           state.graph?.coverage ?? 0,
      circularDeps:       state.graph?.circularDeps.length ?? 0,
      deadCode:           state.graph?.deadCode.length ?? 0,
      buildDurationMs:    state.graph?.durationMs ?? 0,
      builtAt:            state.builtAt,
      lastWrittenBy:      state.lastWrittenBy,
      lastReadBy:         state.lastReadBy,
      lastReadAt:         state.lastReadAt,
      setCount:           state.setCount,
      getCount:           state.getCount,
      queryCount:         state.queryCount,
      incrementalUpdates: state.incrementalUpdates,
      duplicateCount:     state.duplicateCount,
      ageMs:              this.ageMs(),
      health:             this.snapshotFields().kgHealth,
      operationCount:     state.operations.length,
    };
  }

  // ── EF-60.4.3: Full operation log ────────────────────────────────────────

  getOperationLog(): KGSOperation[] {
    return [...getGlobalState().operations];
  }

  // ── EF-60.4.4: Instance identity verification ────────────────────────────

  getInstanceId(): string {
    return getGlobalState().instanceId;
  }

  // EF-60.4.5: total unique instances ever created (> 1 = problem)
  getDuplicateCount(): number {
    return getGlobalState().duplicateCount;
  }
}

// ── Export the singleton ──────────────────────────────────────────────────────
// On first load: creates the class instance and initialises globalThis state.
// On HMR re-evaluation: creates a new class wrapper but reuses globalThis state,
// so the graph data is never lost and instanceId stays the same.

export const KnowledgeGraphStore = new KnowledgeGraphStoreClass();