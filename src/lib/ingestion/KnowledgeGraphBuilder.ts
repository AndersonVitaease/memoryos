// KnowledgeGraphBuilder.ts — Sprint EF-37
// Builds a knowledge graph from extracted entities, decisions, and memories

import type { KnowledgeGraphNode, KnowledgeGraphEdge, ExtractedEntity, ExtractedDecision, ConsolidatedMemory } from "./KipTypes";

let _seq = 0;
const uid = () => `nd-${Date.now()}-${++_seq}`;

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export const KnowledgeGraphBuilder = {
  build(params: {
    entities:  ExtractedEntity[];
    decisions: ExtractedDecision[];
    memories:  ConsolidatedMemory[];
    conversationId: string;
  }): KnowledgeGraph {
    const nodes: KnowledgeGraphNode[] = [];
    const edges: KnowledgeGraphEdge[] = [];
    const nodeIndex = new Map<string, string>(); // label→id

    function getOrCreate(label: string, type: KnowledgeGraphNode["type"], meta?: Record<string, unknown>): string {
      const key = `${type}:${label.toLowerCase()}`;
      if (nodeIndex.has(key)) return nodeIndex.get(key)!;
      const id = uid();
      nodes.push({ id, type, label, metadata: meta });
      nodeIndex.set(key, id);
      return id;
    }

    // Conversation node
    const convId = getOrCreate(params.conversationId, "Conversation");

    // Entity nodes + edges to conversation
    for (const entity of params.entities) {
      const nodeType: KnowledgeGraphNode["type"] =
        entity.type === "Person"    ? "User" :
        entity.type === "Project"   ? "Project" :
        entity.type === "Connector" ? "Connector" :
        entity.type === "Specialist"? "Specialist" :
        entity.type === "Document"  ? "File" :
        "Component";

      const entityNodeId = getOrCreate(entity.value, nodeType);
      edges.push({ from: convId, to: entityNodeId, relation: "mentions", weight: entity.confidence });
    }

    // Decision nodes
    for (const decision of params.decisions) {
      const decNodeId = getOrCreate(`${decision.type}:${decision.subject.slice(0, 40)}`, "Decision", { type: decision.type });
      edges.push({ from: convId, to: decNodeId, relation: "produces_decision", weight: decision.confidence });
    }

    // Memory → conversation edges
    for (const memory of params.memories) {
      const memNodeId = getOrCreate(`mem:${memory.id}`, "Component", { type: memory.type });
      edges.push({ from: memNodeId, to: convId, relation: "sourced_from", weight: memory.evidence.confidence });
    }

    // Entity cross-links (entities mentioned in same message)
    const msgEntityMap = new Map<string, string[]>();
    for (const entity of params.entities) {
      const existing = msgEntityMap.get(entity.messageId) ?? [];
      existing.push(entity.value);
      msgEntityMap.set(entity.messageId, existing);
    }
    for (const [, entityValues] of msgEntityMap) {
      if (entityValues.length >= 2) {
        for (let i = 0; i < entityValues.length - 1; i++) {
          const fromId = nodeIndex.get(`component:${entityValues[i].toLowerCase()}`) ??
                         nodeIndex.get(`user:${entityValues[i].toLowerCase()}`) ??
                         nodeIndex.get(`connector:${entityValues[i].toLowerCase()}`);
          const toId   = nodeIndex.get(`component:${entityValues[i+1].toLowerCase()}`) ??
                         nodeIndex.get(`user:${entityValues[i+1].toLowerCase()}`) ??
                         nodeIndex.get(`connector:${entityValues[i+1].toLowerCase()}`);
          if (fromId && toId) {
            edges.push({ from: fromId, to: toId, relation: "co_mentioned", weight: 0.5 });
          }
        }
      }
    }

    return { nodes, edges };
  },
};