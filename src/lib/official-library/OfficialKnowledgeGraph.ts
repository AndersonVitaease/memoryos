/**
 * OfficialKnowledgeGraph.ts — Sprint EF-7.2.1 (refactored)
 *
 * Backward-compatible facade over the new separated GraphBuilder/GraphStorage/GraphQuery.
 * Existing consumers (OfficialLibraryProvider, OfficialLibraryWatcher, tests) continue to work.
 *
 * EF-7.2.1 change: build/store/query are now delegated to dedicated SRP classes.
 * This class is a thin facade only — no logic lives here.
 */

import type { KnowledgeGraphNode, KnowledgeGraphEdge } from "./OfficialLibraryTypes";
import type { OfficialChunk } from "./OfficialLibraryTypes";
import { GraphBuilder }  from "./GraphBuilder";
import { GraphStorage }  from "./GraphStorage";
import { GraphQuery }    from "./GraphQuery";

export class OfficialKnowledgeGraph {
  private readonly _storage = new GraphStorage();
  private readonly _query   = new GraphQuery(this._storage);

  build(chunks: OfficialChunk[]): void {
    const data = GraphBuilder.build(chunks);
    this._storage.store(data);
  }

  getNodes(): KnowledgeGraphNode[] { return this._query.getNodes(); }
  getEdges(): KnowledgeGraphEdge[] { return this._query.getEdges(); }
  getDocumentLinks(documentId: string): KnowledgeGraphNode[] { return this._query.getDocumentLinks(documentId); }
  getComponentDocuments(component: string): KnowledgeGraphNode[] { return this._query.getComponentDocuments(component); }

  get nodeCount(): number { return this._storage.nodeCount; }
  get edgeCount(): number { return this._storage.edgeCount; }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __OL_KNOWLEDGE_GRAPH__?: OfficialKnowledgeGraph };
if (!G.__OL_KNOWLEDGE_GRAPH__) G.__OL_KNOWLEDGE_GRAPH__ = new OfficialKnowledgeGraph();
export const officialKnowledgeGraph: OfficialKnowledgeGraph = G.__OL_KNOWLEDGE_GRAPH__;