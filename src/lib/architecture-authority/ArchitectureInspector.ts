/**
 * ArchitectureInspector.ts — Sprint 6.2.3
 * Produces a live snapshot of the MemoryOS architecture.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import { CORE_IMMUTABLE }      from "./AATypes";
import type { ArchitectureSnapshot } from "./AATypes";

const KNOWN_SINGLETONS  = ["KnowledgeGraphStore", "ConnectorInvocationService", "LiveCognitivePipeline", "EngineeringMemory"];
const KNOWN_PIPELINES   = ["LiveCognitivePipeline", "ConversationCognitiveGateway", "CognitivePipelineAdapter", "PrimaryConversationRouter"];
const KNOWN_CONNECTORS  = ["GitHubConnector", "Base44Connector", "ConnectorInvocationService"];
const KNOWN_ROUTES      = ["/", "/chat", "/memory", "/projects", "/search", "/connections", "/phase62*"];
const KNOWN_PUBLIC_APIS = ["KnowledgeGraphStore API", "ConversationGateway API", "Connector API", "Workflow API", "Governance API", "Engineering API", "Pipeline API", "RepositoryKnowledgeBuilder API"];

export class ArchitectureInspector {
  inspect(): ArchitectureSnapshot {
    const kgReady      = KnowledgeGraphStore.isReady();
    const fields       = KnowledgeGraphStore.snapshotFields() as any;
    const kgEntityCount = fields?.kgEntityCount ?? 0;

    // Modules from KG if available
    const modules: string[] = kgReady
      ? [...new Set(KnowledgeGraphStore.listAllEntities("ArchitectureInspector").map(e => e.filePath.split("/").slice(0, 3).join("/")))]
      : CORE_IMMUTABLE.map(c => `src/lib/${c.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)}`);

    // Imports / exports — simplified from KG entities
    const importsMap: Record<string, string[]> = {};
    const exportsMap: Record<string, string[]> = {};
    if (kgReady) {
      const entities = KnowledgeGraphStore.listAllEntities("ArchitectureInspector").slice(0, 40);
      entities.forEach(e => {
        importsMap[e.name] = e.imports.slice(0, 5);
        exportsMap[e.name] = e.exports.slice(0, 5);
      });
    }

    // Cycle detection — look for mutual dependencies in KG
    const cycles: string[][] = kgReady ? KnowledgeGraphStore.diagnostics().circularDeps ?? [] : [];

    // Duplicates — names that appear more than once across entities
    const allNames = kgReady
      ? KnowledgeGraphStore.listAllEntities("ArchitectureInspector").map(e => e.name)
      : [];
    const seen = new Map<string, number>();
    allNames.forEach(n => seen.set(n, (seen.get(n) ?? 0) + 1));
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);

    return {
      modules:       [...new Set(modules)].slice(0, 30),
      pipelines:     KNOWN_PIPELINES,
      singletons:    KNOWN_SINGLETONS,
      connectors:    KNOWN_CONNECTORS,
      publicAPIs:    KNOWN_PUBLIC_APIS,
      contracts:     KNOWN_PUBLIC_APIS,
      routes:        KNOWN_ROUTES,
      cycles:        cycles.slice(0, 5),
      duplicates:    duplicates.slice(0, 10),
      imports:       importsMap,
      exports:       exportsMap,
      kgEntityCount,
      kgReady,
      snapshotAt:    Date.now(),
    };
  }
}