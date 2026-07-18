/**
 * GraphQuery.ts — Sprint EF-7.2.1
 *
 * Single responsibility: query the KnowledgeGraph.
 * Depends on GraphStorage — never on GraphBuilder.
 * Separated for SRP and testability.
 */

import type { KnowledgeGraphNode, KnowledgeGraphEdge } from "./OfficialLibraryTypes";
import type { GraphStorage } from "./GraphStorage";

export class GraphQuery {
  constructor(private readonly _storage: GraphStorage) {}

  getNodes(): KnowledgeGraphNode[] {
    return [...this._storage.nodes.values()];
  }

  getEdges(): KnowledgeGraphEdge[] {
    return [...this._storage.edges];
  }

  /** All nodes connected to a document node. */
  getDocumentLinks(documentId: string): KnowledgeGraphNode[] {
    const docNodeId = `doc:${documentId}`;
    const connectedIds = this._storage.edges
      .filter(e => e.from === docNodeId || e.to === docNodeId)
      .map(e => e.from === docNodeId ? e.to : e.from);
    return connectedIds
      .map(id => this._storage.nodes.get(id))
      .filter(Boolean) as KnowledgeGraphNode[];
  }

  /** All document nodes linked to a component. */
  getComponentDocuments(component: string): KnowledgeGraphNode[] {
    const compNodeId = `component:${component}`;
    return this._storage.edges
      .filter(e => e.to === compNodeId && e.from.startsWith("doc:"))
      .map(e => this._storage.nodes.get(e.from))
      .filter(Boolean) as KnowledgeGraphNode[];
  }

  /** Find nodes by label substring (case-insensitive). */
  findByLabel(label: string): KnowledgeGraphNode[] {
    const lower = label.toLowerCase();
    return [...this._storage.nodes.values()].filter(n => n.label.toLowerCase().includes(lower));
  }

  /** Strongest edges for a given node. */
  strongestEdges(nodeId: string, maxResults = 5): KnowledgeGraphEdge[] {
    return this._storage.edges
      .filter(e => e.from === nodeId || e.to === nodeId)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxResults);
  }
}