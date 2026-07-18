/**
 * GraphStorage.ts — Sprint EF-7.2.1
 *
 * Single responsibility: store and update KnowledgeGraph data.
 * Separated from GraphBuilder (builds) and GraphQuery (queries).
 */

import type { KnowledgeGraphNode, KnowledgeGraphEdge } from "./OfficialLibraryTypes";
import type { KnowledgeGraphData } from "./GraphBuilder";

export class GraphStorage {
  private _nodes: Map<string, KnowledgeGraphNode> = new Map();
  private _edges: KnowledgeGraphEdge[]             = [];
  private _builtAt: string | null                  = null;

  store(data: KnowledgeGraphData): void {
    this._nodes   = new Map(data.nodes);
    this._edges   = [...data.edges];
    this._builtAt = new Date().toISOString();
  }

  clear(): void {
    this._nodes   = new Map();
    this._edges   = [];
    this._builtAt = null;
  }

  get nodes(): Map<string, KnowledgeGraphNode>  { return this._nodes; }
  get edges(): KnowledgeGraphEdge[]              { return this._edges; }
  get nodeCount(): number                        { return this._nodes.size; }
  get edgeCount(): number                        { return this._edges.length; }
  get builtAt(): string | null                   { return this._builtAt; }
  get isBuilt(): boolean                         { return this._builtAt !== null; }
}