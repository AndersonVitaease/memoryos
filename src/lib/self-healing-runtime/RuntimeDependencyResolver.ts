/**
 * RuntimeDependencyResolver.ts — Sprint 6.3.1
 * Calculates dependency chains to determine which modules must restart
 * when a specific module changes. Never restarts the whole system unnecessarily.
 */

import type { ModuleDescriptor } from "./SHRTypes";

// Built-in module dependency graph (mirrors Architecture Authority layers)
const BUILTIN_DEPS: Record<string, string[]> = {
  KnowledgeGraphStore:          [],
  RepositoryKnowledgeBuilder:   ["KnowledgeGraphStore"],
  SourceCodeParser:             ["KnowledgeGraphStore"],
  ConnectorInvocationService:   [],
  GitHubConnector:              ["ConnectorInvocationService"],
  Base44Connector:              ["ConnectorInvocationService"],
  LiveCognitivePipeline:        ["KnowledgeGraphStore", "ConnectorInvocationService"],
  ConversationCognitiveGateway: ["KnowledgeGraphStore", "LiveCognitivePipeline"],
  GitHubQueryRouter:            ["ConversationCognitiveGateway"],
  CognitiveAnswerComposer:      ["ConversationCognitiveGateway"],
  EngineeringWorkflow:          ["KnowledgeGraphStore"],
  EngineeringOrchestrator:      ["EngineeringWorkflow"],
  EngineeringMemory:            [],
  UniversalConnectorPlatform:   ["ConnectorInvocationService", "EngineeringMemory"],
  SelfHealingRuntime:           [],
};

export class RuntimeDependencyResolver {
  private _modules: Map<string, ModuleDescriptor> = new Map();

  register(descriptor: ModuleDescriptor): void {
    this._modules.set(descriptor.id, descriptor);
  }

  unregister(id: string): void { this._modules.delete(id); }

  /**
   * Returns all modules that (transitively) depend on the given module.
   * These are the modules that must restart when `moduleId` changes.
   */
  resolveDependencyChain(moduleId: string): string[] {
    const allDeps = { ...BUILTIN_DEPS };

    // merge custom-registered modules
    this._modules.forEach((desc, id) => {
      allDeps[id] = desc.dependencies;
    });

    const affected = new Set<string>();
    const visited  = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      Object.entries(allDeps).forEach(([mod, deps]) => {
        if (deps.includes(id) && mod !== moduleId) {
          affected.add(mod);
          visit(mod);
        }
      });
    };

    visit(moduleId);
    return Array.from(affected);
  }

  /**
   * Returns direct dependencies of a module.
   */
  directDependencies(moduleId: string): string[] {
    const desc = this._modules.get(moduleId);
    if (desc) return desc.dependencies;
    return BUILTIN_DEPS[moduleId] ?? [];
  }

  /**
   * Returns the topological restart order for a chain.
   */
  restartOrder(chain: string[]): string[] {
    const allDeps = { ...BUILTIN_DEPS };
    this._modules.forEach((desc, id) => { allDeps[id] = desc.dependencies; });

    // Simple topological sort: modules with no deps first
    const result: string[] = [];
    const remaining = new Set(chain);

    let maxIter = chain.length * chain.length + 1;
    while (remaining.size > 0 && maxIter-- > 0) {
      let progressed = false;
      remaining.forEach(mod => {
        const deps = (allDeps[mod] ?? []).filter(d => remaining.has(d));
        if (deps.length === 0) {
          result.push(mod);
          remaining.delete(mod);
          progressed = true;
        }
      });
      if (!progressed) {
        // cycle or unresolved — push remaining in original order
        remaining.forEach(mod => result.push(mod));
        break;
      }
    }

    return result;
  }

  allRegistered(): ModuleDescriptor[] { return Array.from(this._modules.values()); }

  builtinDependencyMap(): Record<string, string[]> { return { ...BUILTIN_DEPS }; }
}