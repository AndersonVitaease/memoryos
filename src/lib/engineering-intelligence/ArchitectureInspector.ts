/**
 * ArchitectureInspector.ts — Sprint 6.2.1
 * Inspects KG, modules, connectors, pipelines, and Engineering Memory.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import type { ArchitectureReport } from "./EITypes";

const STABLE_COMPONENTS = [
  "RepositoryKnowledgeBuilder", "SourceCodeParser", "KnowledgeGraphStore",
  "LiveCognitivePipeline", "ConversationCognitiveGateway", "GitHubQueryRouter",
  "CognitiveAnswerComposer", "ConnectorInvocationService", "GitHubConnector",
  "Base44Connector", "EngineeringWorkflow",
];

const KNOWN_HOTSPOTS = [
  "KnowledgeGraphStore",  // singleton — HMR sensitive
  "LiveCognitivePipeline", // touches all connectors
  "ConnectorInvocationService", // central routing
  "ConversationCognitiveGateway", // KG intercept layer
];

export class ArchitectureInspector {
  async inspect(objective: string, memoryEntries: Array<{ objective: string; tags: string[] }>): Promise<ArchitectureReport> {
    const t0 = Date.now();
    const lower = objective.toLowerCase();
    const kgReady = KnowledgeGraphStore.isReady();
    const fields  = KnowledgeGraphStore.snapshotFields();
    const kgEntityCount = (fields as any).kgEntityCount ?? 0;
    const kgModuleCount = (fields as any).kgModuleCount ?? 0;

    // Existing components from KG
    const existingComponents: string[] = [];
    if (kgReady) {
      const kw = objective.split(/\s+/).filter(w => w.length > 3);
      for (const w of kw) {
        const hits = KnowledgeGraphStore.queryByKeyword(w, "ArchitectureInspector");
        hits.forEach(h => existingComponents.push(h.name));
      }
    }

    // From stable baseline
    const candidateComponents = STABLE_COMPONENTS.filter(c =>
      lower.split(/\s+/).some(w => w.length > 3 && c.toLowerCase().includes(w))
    );

    // Reusable from KG (entities with exports)
    const reusableComponents: string[] = [];
    if (kgReady) {
      const all = KnowledgeGraphStore.listAllEntities("ArchitectureInspector");
      const keywords = lower.split(/\s+/).filter(w => w.length > 4);
      all.forEach(e => {
        if (keywords.some(k => e.name.toLowerCase().includes(k) || e.filePath.toLowerCase().includes(k))) {
          reusableComponents.push(e.name);
        }
      });
    }

    // Missing from memory (objectives mentioned but not in KG)
    const missingComponents: string[] = [];
    const prevComponents = memoryEntries.flatMap(e => e.tags);
    if (!kgReady) missingComponents.push("KnowledgeGraph (not built)");

    // Conflicting from stable baseline
    const conflictingComponents = STABLE_COMPONENTS.filter(c => lower.includes(c.toLowerCase()));

    // Architectural hotspots
    const architecturalHotspots = KNOWN_HOTSPOTS.filter(h =>
      lower.includes(h.toLowerCase()) || (kgReady && KnowledgeGraphStore.query(h, "inspector").found)
    );

    return {
      existingComponents:    [...new Set(existingComponents)].slice(0, 12),
      candidateComponents:   [...new Set(candidateComponents)],
      reusableComponents:    [...new Set(reusableComponents)].slice(0, 10),
      missingComponents,
      conflictingComponents,
      architecturalHotspots,
      kgEntityCount,
      kgModuleCount,
      kgReady,
      durationMs: Date.now() - t0,
    };
  }
}