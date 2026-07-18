/**
 * OfficialKnowledgeGraph.ts — Sprint EF-7.2.0
 *
 * Builds automatic semantic links between:
 *   Planner, Goal Runtime, Capability Registry, Connector Runtime,
 *   UCME, MRE, Workflow, Governance, Engineering Memory.
 *
 * Each official document gets internal semantic links.
 * The graph is used by OfficialLibraryProvider to enrich MemoryEvidence.
 */

import type { KnowledgeGraphNode, KnowledgeGraphEdge, KnowledgeNodeType, KnowledgeEdgeType } from "./OfficialLibraryTypes";
import type { OfficialChunk } from "./OfficialLibraryTypes";

// ── Keyword → Component map ───────────────────────────────────────────────────

const COMPONENT_KEYWORDS: Record<string, string[]> = {
  "ucme":            ["ucme", "unified memory engine", "memory provider", "memoryevidence", "memoryproviderregistry"],
  "mre":             ["mre", "memory reasoning engine", "reasoningresult", "evidenceanalyzer", "conflictresolver"],
  "planner":         ["planner", "conversationplanning", "planningengine", "executionplan"],
  "goal-runtime":    ["goal runtime", "goalregistry", "goalexecutionqueue", "goalscheduler"],
  "capability-registry": ["capability registry", "capabilityregistry", "capabilityruntime"],
  "connector-runtime":   ["connector runtime", "connectorregistry", "iconnector", "connectorbootstrap"],
  "workflow":        ["workflow", "orchestration", "workflowengine"],
  "governance":      ["governance", "architecture governance", "architecturalconstraints", "adr"],
  "engineering-memory": ["engineering memory", "decisionmemory", "patternmemory", "repairengine"],
  "official-library":   ["official library", "officiallibraryprovider", "memoryauthority", "official document"],
  "similarity-engine":  ["similarity engine", "jaccard", "embedding", "cosine similarity"],
  "confidence-policy":  ["confidence policy", "confidenceadjuster", "corroboration"],
  "rule-registry":      ["rule registry", "reasoningrule", "builtin rules"],
};

// ── Graph implementation ──────────────────────────────────────────────────────

export class OfficialKnowledgeGraph {
  private _nodes: Map<string, KnowledgeGraphNode> = new Map();
  private _edges: KnowledgeGraphEdge[]             = [];

  /** Build the graph from indexed chunks. */
  build(chunks: OfficialChunk[]): void {
    this._nodes.clear();
    this._edges = [];

    // 1. Create document nodes
    for (const chunk of chunks) {
      const docNodeId = `doc:${chunk.documentId}`;
      if (!this._nodes.has(docNodeId)) {
        this._nodes.set(docNodeId, {
          id:         docNodeId,
          label:      chunk.documentName,
          type:       "document" as KnowledgeNodeType,
          documentId: chunk.documentId,
          version:    chunk.version,
          tags:       chunk.tags,
        });
      }
    }

    // 2. Create component nodes (system-level)
    for (const [component] of Object.entries(COMPONENT_KEYWORDS)) {
      const nodeId = `component:${component}`;
      if (!this._nodes.has(nodeId)) {
        this._nodes.set(nodeId, {
          id:         nodeId,
          label:      component,
          type:       "component" as KnowledgeNodeType,
          documentId: "",
          version:    "runtime",
          tags:       ["system"],
        });
      }
    }

    // 3. Build edges: document ↔ component
    for (const chunk of chunks) {
      const docNodeId = `doc:${chunk.documentId}`;
      const haystack  = `${chunk.title} ${chunk.content} ${chunk.tags.join(" ")}`.toLowerCase();

      for (const [component, keywords] of Object.entries(COMPONENT_KEYWORDS)) {
        const hits = keywords.filter(kw => haystack.includes(kw)).length;
        if (hits === 0) continue;
        const strength = Math.min(1, hits / keywords.length);
        const edgeId   = `${docNodeId}→component:${component}`;
        // Avoid duplicates
        if (!this._edges.some(e => e.from === docNodeId && e.to === `component:${component}`)) {
          this._edges.push({
            from:         docNodeId,
            to:           `component:${component}`,
            relationship: "documents" as KnowledgeEdgeType,
            strength,
          });
        }
      }
    }

    // 4. Governance constraints
    const govNode = this._nodes.get("component:governance");
    if (govNode) {
      for (const [comp] of Object.entries(COMPONENT_KEYWORDS)) {
        if (comp !== "governance") {
          this._edges.push({
            from:         "component:governance",
            to:           `component:${comp}`,
            relationship: "governs" as KnowledgeEdgeType,
            strength:     0.6,
          });
        }
      }
    }
  }

  /** Get all nodes. */
  getNodes(): KnowledgeGraphNode[] {
    return [...this._nodes.values()];
  }

  /** Get all edges. */
  getEdges(): KnowledgeGraphEdge[] {
    return [...this._edges];
  }

  /** Get nodes connected to a document. */
  getDocumentLinks(documentId: string): KnowledgeGraphNode[] {
    const docNodeId = `doc:${documentId}`;
    const connectedIds = this._edges
      .filter(e => e.from === docNodeId || e.to === docNodeId)
      .map(e => e.from === docNodeId ? e.to : e.from);
    return connectedIds.map(id => this._nodes.get(id)).filter(Boolean) as KnowledgeGraphNode[];
  }

  /** Find documents related to a component. */
  getComponentDocuments(component: string): KnowledgeGraphNode[] {
    const compNodeId = `component:${component}`;
    return this._edges
      .filter(e => e.to === compNodeId && e.from.startsWith("doc:"))
      .map(e => this._nodes.get(e.from))
      .filter(Boolean) as KnowledgeGraphNode[];
  }

  get nodeCount(): number { return this._nodes.size; }
  get edgeCount(): number { return this._edges.length; }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_KNOWLEDGE_GRAPH__?: OfficialKnowledgeGraph };
if (!G.__OL_KNOWLEDGE_GRAPH__) G.__OL_KNOWLEDGE_GRAPH__ = new OfficialKnowledgeGraph();
export const officialKnowledgeGraph: OfficialKnowledgeGraph = G.__OL_KNOWLEDGE_GRAPH__;