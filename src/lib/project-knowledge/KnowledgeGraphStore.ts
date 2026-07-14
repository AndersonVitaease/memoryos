/**
 * KnowledgeGraphStore.ts — EF-60.1.1 / 60.1.6
 * Phase 6.0.1 · MemoryOS · 2026-07-14
 *
 * Module-scoped singleton that holds the live ProjectKnowledgeGraph.
 * This makes the graph available to all pipeline stages and the planner
 * without requiring them to rebuild it from scratch on each query.
 *
 * Architectural rule: no engine imports this directly to BUILD the graph —
 * only RepositoryKnowledgeBuilder writes here. All other components read-only.
 */

import type { ProjectKnowledgeGraph, KnowledgeQueryResult, ArchEntity } from "./PKBTypes";

class KnowledgeGraphStoreClass {
  private _graph: ProjectKnowledgeGraph | null = null;
  private _builtAt = 0;
  private _incrementalUpdates = 0;
  private _plannerQueries = 0;

  // ── Write (only RepositoryKnowledgeBuilder calls this) ────────────────────

  set(graph: ProjectKnowledgeGraph): void {
    this._graph  = graph;
    this._builtAt = Date.now();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  get(): ProjectKnowledgeGraph | null { return this._graph; }
  isReady(): boolean                  { return this._graph !== null && this._graph.entityCount > 0; }
  builtAt(): number                   { return this._builtAt; }
  ageMs(): number                     { return this._builtAt > 0 ? Date.now() - this._builtAt : Infinity; }

  // ── Snapshot fields (EF-60.1.4) ──────────────────────────────────────────

  snapshotFields(): Record<string, unknown> {
    if (!this._graph) {
      return {
        kgReady: false, kgEntityCount: 0, kgRelationshipCount: 0, kgModuleCount: 0,
        kgCoverage: 0, kgDeadCode: 0, kgCircularDeps: 0, kgLayers: {}, kgHealth: "NOT_BUILT",
      };
    }
    const g = this._graph;
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
    };
  }

  // ── Query (EF-60.1.8) ─────────────────────────────────────────────────────

  query(entityName: string): KnowledgeQueryResult {
    this._plannerQueries++;
    if (!this._graph) {
      return { found: false, entityName, entity: null, dependents: [], dependencies: [], relationships: [], source: "not_found", confidence: 0 };
    }
    const entity = this._graph.entities.find(e =>
      e.name.toLowerCase() === entityName.toLowerCase() ||
      e.filePath.toLowerCase().includes(entityName.toLowerCase().replace(/\s+/g, ""))
    );
    if (!entity) {
      return { found: false, entityName, entity: null, dependents: [], dependencies: [], relationships: [], source: "not_found", confidence: 0 };
    }
    const rels  = this._graph.relationships.filter(r => r.fromId === entity.id || r.toId === entity.id);
    const deps  = entity.dependencies.map(id => this._graph!.entities.find(e => e.id === id)).filter(Boolean) as ArchEntity[];
    const depts = entity.dependents.map(id => this._graph!.entities.find(e => e.id === id)).filter(Boolean) as ArchEntity[];
    return {
      found: true, entityName, entity,
      dependents: depts, dependencies: deps, relationships: rels,
      source: "knowledge_graph", confidence: entity.confidence,
    };
  }

  // ── Architecture queries (EF-60.1.8 acceptance tests) ────────────────────

  queryByKeyword(keyword: string): ArchEntity[] {
    this._plannerQueries++;
    if (!this._graph) return [];
    const kw = keyword.toLowerCase();
    return this._graph.entities.filter(e =>
      e.name.toLowerCase().includes(kw) ||
      e.filePath.toLowerCase().includes(kw) ||
      e.responsibilities.some(r => r.toLowerCase().includes(kw))
    ).slice(0, 20);
  }

  listLayers(): Record<string, number> {
    if (!this._graph) return {};
    return Object.fromEntries(Object.entries(this._graph.layers).map(([k, v]) => [k, v.length]));
  }

  listAllEntities(): Array<{ name: string; type: string; layer: string; filePath: string }> {
    if (!this._graph) return [];
    return this._graph.entities.map(e => ({ name: e.name, type: e.type, layer: e.layer, filePath: e.filePath }));
  }

  detectCircularDeps(): string[][] { return this._graph?.circularDeps ?? []; }
  detectDeadCode(): string[]       { return this._graph?.deadCode ?? []; }

  // ── Diagnostics (EF-60.1.9) ──────────────────────────────────────────────

  recordIncrementalUpdate(): void { this._incrementalUpdates++; }

  diagnostics(): Record<string, unknown> {
    return {
      ready:              this.isReady(),
      entityCount:        this._graph?.entityCount ?? 0,
      relationshipCount:  this._graph?.relationshipCount ?? 0,
      moduleCount:        this._graph?.modules.length ?? 0,
      dependencyEdges:    this._graph?.relationships.length ?? 0,
      coverage:           this._graph?.coverage ?? 0,
      circularDeps:       this._graph?.circularDeps.length ?? 0,
      deadCode:           this._graph?.deadCode.length ?? 0,
      buildDurationMs:    this._graph?.durationMs ?? 0,
      incrementalUpdates: this._incrementalUpdates,
      plannerQueries:     this._plannerQueries,
      ageMs:              this.ageMs(),
      health:             this.snapshotFields().kgHealth,
    };
  }
}

// Module-scope singleton — survives across pipeline re-runs in the same session
export const KnowledgeGraphStore = new KnowledgeGraphStoreClass();