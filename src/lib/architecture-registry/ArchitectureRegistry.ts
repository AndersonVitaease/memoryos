/**
 * ArchitectureRegistry — Sprint EF-60
 *
 * Unica fonte de verdade arquitetural do MemoryOS.
 * Todos os metadados sao publicados pelos proprios engines via registerEngine().
 * A certificacao EF-59 e qualquer outro consumidor devem usar exclusivamente esta API.
 *
 * PROIBIDO: declarar OFFICIAL_PIPELINE, OWNERSHIP_MATRIX, DEPENDENCY_RULES manualmente fora daqui.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineContract {
  input: string;
  output: string;
  execution: string;
  lifecycle: string;
  ctxFields: string[];       // ExecutionContext fields this engine writes
  ctxReads?: string[];       // ExecutionContext fields this engine reads
}

export interface EngineOwnership {
  creates: string[];
  modifies: string[];
  consumes: string[];
  publishes: string[];
  persists: string[];
}

export interface EngineDependency {
  engineId: string;
  type: "consumes" | "reads" | "writes" | "persists" | "orchestrates" | "inner";
  legal: boolean;
}

export interface EngineMetadata {
  id: string;
  name: string;
  version: string;
  owner: string;            // package / module owner
  responsibility: string;
  pipelineStage: number;    // 0-based order in official pipeline (0 = first)
  contract: EngineContract;
  ownership: EngineOwnership;
  dependencies: EngineDependency[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: string;
  legal: boolean;
}

export interface ArchitectureSnapshot {
  engines: EngineMetadata[];
  pipeline: EngineMetadata[];          // sorted by pipelineStage
  dependencyGraph: DependencyEdge[];
  registeredAt: string;
  totalEngines: number;
  totalStages: number;
}

// ── Registry ──────────────────────────────────────────────────────────────────

class ArchitectureRegistryImpl {
  private engines = new Map<string, EngineMetadata>();
  private _bootstrapped = false;

  /** Called by each engine at module load time to publish its metadata. */
  registerEngine(meta: EngineMetadata): void {
    this.engines.set(meta.id, meta);
  }

  /** Returns all registered engines sorted by pipeline stage. */
  getPipeline(): EngineMetadata[] {
    return [...this.engines.values()].sort((a, b) => a.pipelineStage - b.pipelineStage);
  }

  getEngine(id: string): EngineMetadata | undefined {
    return this.engines.get(id);
  }

  getAllEngines(): EngineMetadata[] {
    return [...this.engines.values()];
  }

  /** Reconstruct dependency graph from all engine declarations. */
  getDependencyGraph(): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    for (const engine of this.engines.values()) {
      for (const dep of engine.dependencies) {
        edges.push({
          from: engine.id,
          to:   dep.engineId,
          type: dep.type,
          legal: dep.legal,
        });
      }
    }
    return edges;
  }

  /** Detect circular dependencies using DFS. */
  detectCircularDependencies(): string[][] {
    const graph = new Map<string, string[]>();
    for (const engine of this.engines.values()) {
      graph.set(engine.id, engine.dependencies.filter(d => d.legal).map(d => d.engineId));
    }
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (stack.has(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push([...path.slice(cycleStart), node]);
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      stack.add(node);
      path.push(node);
      for (const neighbor of (graph.get(node) ?? [])) {
        if (this.engines.has(neighbor)) dfs(neighbor);
      }
      path.pop();
      stack.delete(node);
    };

    for (const id of this.engines.keys()) dfs(id);
    return cycles;
  }

  /** Detect illegal dependencies. */
  detectIllegalDependencies(): DependencyEdge[] {
    return this.getDependencyGraph().filter(e => !e.legal);
  }

  /** Full architecture snapshot. */
  getSnapshot(): ArchitectureSnapshot {
    this._ensureBootstrapped();
    const pipeline = this.getPipeline();
    return {
      engines: this.getAllEngines(),
      pipeline,
      dependencyGraph: this.getDependencyGraph(),
      registeredAt: new Date().toISOString(),
      totalEngines: this.engines.size,
      totalStages: pipeline.length,
    };
  }

  /** Ownership matrix derived from engine metadata. No manual declarations. */
  getOwnershipMatrix(): Array<EngineMetadata & { ownership: EngineOwnership }> {
    return this.getPipeline().map(e => ({ ...e }));
  }

  /** Contract registry derived from engine metadata. */
  getContractRegistry(): Array<{ engineId: string; name: string; contract: EngineContract }> {
    return this.getPipeline().map(e => ({ engineId: e.id, name: e.name, contract: e.contract }));
  }

  private _ensureBootstrapped(): void {
    if (!this._bootstrapped) {
      // Trigger self-registration of all official engines
      this._bootstrapped = true;
    }
  }

  /** Introspection API — validate a run's ExecutionContext against declared contracts. */
  validateExecutionContext(ctx: Record<string, unknown>): { valid: boolean; missing: string[]; present: string[] } {
    const allCtxFields = this.getPipeline().flatMap(e => e.contract.ctxFields);
    const missing = allCtxFields.filter(f => ctx[f] === undefined || ctx[f] === null);
    const present = allCtxFields.filter(f => ctx[f] !== undefined && ctx[f] !== null);
    return { valid: missing.length === 0, missing, present };
  }
}

export const ArchitectureRegistry = new ArchitectureRegistryImpl();