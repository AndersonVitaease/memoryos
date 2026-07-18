/**
 * GraphBuilder.ts — Sprint EF-7.2.1
 *
 * Single responsibility: build a KnowledgeGraph from chunks.
 * Separated from GraphStorage and GraphQuery (SRP).
 *
 * Pipeline:
 *   Chunks → GraphBuilder → GraphStorage → GraphQuery
 */

import type { KnowledgeGraphNode, KnowledgeGraphEdge, KnowledgeNodeType, KnowledgeEdgeType } from "./OfficialLibraryTypes";
import type { OfficialChunk } from "./OfficialLibraryTypes";

export interface KnowledgeGraphData {
  readonly nodes: Map<string, KnowledgeGraphNode>;
  readonly edges: KnowledgeGraphEdge[];
}

// ── Component keyword catalog ─────────────────────────────────────────────────
// Defines semantic links between document content and system components.
// OCP: add new entries here — GraphBuilder algorithm never changes.

const COMPONENT_KEYWORDS: Record<string, string[]> = {
  "ucme":               ["ucme", "unified memory engine", "memory provider", "memoryevidence", "memoryproviderregistry"],
  "mre":                ["mre", "memory reasoning engine", "reasoningresult", "evidenceanalyzer", "conflictresolver"],
  "planner":            ["planner", "conversationplanning", "planningengine", "executionplan"],
  "goal-runtime":       ["goal runtime", "goalregistry", "goalexecutionqueue", "goalscheduler"],
  "capability-registry":["capability registry", "capabilityregistry", "capabilityruntime"],
  "connector-runtime":  ["connector runtime", "connectorregistry", "iconnector", "connectorbootstrap"],
  "workflow":           ["workflow", "orchestration", "workflowengine"],
  "governance":         ["governance", "architecture governance", "architecturalconstraints", "adr"],
  "engineering-memory": ["engineering memory", "decisionmemory", "patternmemory", "repairengine"],
  "official-library":   ["official library", "officiallibraryprovider", "memoryauthority", "official document"],
  "similarity-engine":  ["similarity engine", "jaccard", "embedding", "cosine similarity"],
  "confidence-policy":  ["confidence policy", "confidenceadjuster", "corroboration"],
  "rule-registry":      ["rule registry", "reasoningrule", "builtin rules"],
};

export const GraphBuilder = {

  /** Build graph data from indexed chunks. Pure function — no side effects. */
  build(chunks: OfficialChunk[]): KnowledgeGraphData {
    const nodes = new Map<string, KnowledgeGraphNode>();
    const edges: KnowledgeGraphEdge[] = [];
    const edgeKeys = new Set<string>();

    // 1. Document nodes
    for (const chunk of chunks) {
      const id = `doc:${chunk.documentId}`;
      if (!nodes.has(id)) {
        nodes.set(id, {
          id, label: chunk.documentName,
          type: "document" as KnowledgeNodeType,
          documentId: chunk.documentId,
          version:    chunk.version,
          tags:       chunk.tags,
        });
      }
    }

    // 2. Component nodes
    for (const component of Object.keys(COMPONENT_KEYWORDS)) {
      const id = `component:${component}`;
      nodes.set(id, {
        id, label: component,
        type: "component" as KnowledgeNodeType,
        documentId: "", version: "runtime", tags: ["system"],
      });
    }

    // 3. Document → Component edges
    for (const chunk of chunks) {
      const from     = `doc:${chunk.documentId}`;
      const haystack = `${chunk.title} ${chunk.content} ${chunk.tags.join(" ")}`.toLowerCase();

      for (const [component, keywords] of Object.entries(COMPONENT_KEYWORDS)) {
        const hits = keywords.filter(kw => haystack.includes(kw)).length;
        if (hits === 0) continue;
        const to    = `component:${component}`;
        const eKey  = `${from}→${to}`;
        if (!edgeKeys.has(eKey)) {
          edgeKeys.add(eKey);
          edges.push({
            from, to,
            relationship: "documents" as KnowledgeEdgeType,
            strength:     Math.min(1, hits / keywords.length),
          });
        }
      }
    }

    // 4. Governance → all components edges
    for (const component of Object.keys(COMPONENT_KEYWORDS)) {
      if (component === "governance") continue;
      const eKey = `component:governance→component:${component}`;
      if (!edgeKeys.has(eKey)) {
        edgeKeys.add(eKey);
        edges.push({
          from: "component:governance",
          to:   `component:${component}`,
          relationship: "governs" as KnowledgeEdgeType,
          strength: 0.6,
        });
      }
    }

    return { nodes, edges };
  },
};