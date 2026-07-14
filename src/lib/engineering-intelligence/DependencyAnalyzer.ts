/**
 * DependencyAnalyzer.ts — Sprint 6.2.1
 * Generates an Impact Graph for an engineering objective.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import type { ImpactGraph, ImpactNode } from "./EITypes";

const SINGLETON_LIST = [
  "KnowledgeGraphStore", "ConnectorInvocationService", "LiveCognitivePipeline",
  "EngineeringOrchestrator", "EngineeringMemory",
];

const PIPELINE_LIST = [
  "LiveCognitivePipeline", "ConversationCognitiveGateway", "CognitivePipelineAdapter",
  "PrimaryConversationRouter",
];

const CONNECTOR_LIST = [
  "GitHubConnector", "Base44Connector", "ConnectorRuntime", "ConnectorInvocationService",
];

export class DependencyAnalyzer {
  analyze(objective: string, requiredComponents: string[]): ImpactGraph {
    const t0 = Date.now();
    const lower = objective.toLowerCase();
    const nodes: ImpactNode[] = [];

    const addNode = (name: string, type: ImpactNode["type"], impact: ImpactNode["impact"], reason: string) => {
      if (!nodes.find(n => n.name === name)) nodes.push({ name, type, impact, reason });
    };

    // Direct impacts from required components
    for (const comp of requiredComponents) {
      addNode(comp, "file", "DIRECT", "Required by objective");
    }

    // Singleton impact
    for (const s of SINGLETON_LIST) {
      if (lower.includes(s.toLowerCase()) || requiredComponents.includes(s)) {
        addNode(s, "singleton", "DIRECT", "Singleton — HMR sensitive, requires careful modification");
      }
    }

    // Pipeline impact
    for (const p of PIPELINE_LIST) {
      if (lower.includes(p.toLowerCase())) {
        addNode(p, "pipeline", "DIRECT", "Core pipeline stage affected");
      } else if (requiredComponents.some(rc => p.toLowerCase().includes(rc.toLowerCase()))) {
        addNode(p, "pipeline", "INDIRECT", "May be indirectly affected via component dependency");
      }
    }

    // Connector impact
    for (const c of CONNECTOR_LIST) {
      if (lower.includes(c.toLowerCase()) || lower.includes("connector")) {
        addNode(c, "connector", lower.includes(c.toLowerCase()) ? "DIRECT" : "INDIRECT",
          lower.includes(c.toLowerCase()) ? "Connector directly mentioned" : "Connector layer may be affected");
      }
    }

    // KG impact from entity graph
    if (KnowledgeGraphStore.isReady()) {
      for (const comp of requiredComponents) {
        const result = KnowledgeGraphStore.query(comp, "DependencyAnalyzer");
        if (result.found && result.entity) {
          result.dependencies.forEach(dep =>
            addNode(dep.name, "module", "INDIRECT", `Dependency of ${comp} in KG`));
          result.dependents.forEach(dep =>
            addNode(dep.name, "module", "INDIRECT", `Dependent of ${comp} in KG — may break`));
        }
      }
    }

    const affectedFiles     = nodes.filter(n => n.impact !== "NONE" && n.type === "file").map(n => n.name);
    const affectedModules   = nodes.filter(n => n.impact !== "NONE" && n.type === "module").map(n => n.name);
    const affectedConnectors = nodes.filter(n => n.impact !== "NONE" && n.type === "connector").map(n => n.name);
    const affectedPipelines  = nodes.filter(n => n.impact !== "NONE" && n.type === "pipeline").map(n => n.name);
    const singletonsTouched  = nodes.filter(n => n.type === "singleton").map(n => n.name);

    const kgImpact = KnowledgeGraphStore.isReady()
      ? `${nodes.filter(n => n.impact === "DIRECT").length} direct KG entities affected`
      : "KG not built — impact cannot be fully assessed";

    const regressionImpact = singletonsTouched.length > 0
      ? `HIGH — singletons touched: ${singletonsTouched.join(", ")}`
      : affectedPipelines.length > 0
        ? `MEDIUM — pipeline stages affected`
        : "LOW — no singletons or pipelines directly affected";

    return {
      nodes,
      affectedFiles,
      affectedModules,
      affectedConnectors,
      affectedPipelines,
      singletonsTouched,
      kgImpact,
      regressionImpact,
      durationMs: Date.now() - t0,
    };
  }
}