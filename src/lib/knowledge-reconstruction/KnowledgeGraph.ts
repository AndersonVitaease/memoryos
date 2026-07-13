/**
 * KnowledgeGraph.ts — Internal Knowledge Graph
 * EF-36A · Project Independence · Foundation v1.0
 *
 * Stores nodes and edges in-memory.
 * No visualization — pure data structure.
 * Supports: project, sprint, rfc, adr, connector, document, conversation,
 *   commit, decision, implementation, requirement, specialist, goal, artifact
 */

import type { GraphNode, GraphEdge, GraphNodeType } from "./KRETypes";
import { makeKREId } from "./KRETypes";

export class KnowledgeGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();
  // adjacency: nodeId → set of edgeIds originating from it
  private readonly adjacency = new Map<string, Set<string>>();

  // ── Nodes ──────────────────────────────────────────────────────────────────

  addNode(
    type: GraphNodeType,
    label: string,
    properties: Record<string, unknown>,
    sourceId: string,
    existingId?: string,
  ): GraphNode {
    const id = existingId ?? makeKREId("node");
    const node: GraphNode = Object.freeze({
      id, type, label,
      properties: Object.freeze({ ...properties }),
      sourceId,
      createdAt: Date.now(),
    });
    this.nodes.set(id, node);
    if (!this.adjacency.has(id)) this.adjacency.set(id, new Set());
    return node;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    // Remove all edges connected to this node
    for (const [eid, edge] of this.edges) {
      if (edge.fromNodeId === id || edge.toNodeId === id) {
        this.edges.delete(eid);
      }
    }
    this.adjacency.delete(id);
  }

  listNodes(type?: GraphNodeType): GraphNode[] {
    const all = Array.from(this.nodes.values());
    return type ? all.filter(n => n.type === type) : all;
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  addEdge(
    fromNodeId: string,
    toNodeId: string,
    label: string,
    weight = 1.0,
  ): GraphEdge | null {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) return null;
    const id = makeKREId("edge");
    const edge: GraphEdge = Object.freeze({ id, fromNodeId, toNodeId, label, weight, createdAt: Date.now() });
    this.edges.set(id, edge);
    const adj = this.adjacency.get(fromNodeId) ?? new Set<string>();
    adj.add(id);
    this.adjacency.set(fromNodeId, adj);
    return edge;
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  listEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  /** Returns all edges originating from a node */
  edgesFrom(nodeId: string): GraphEdge[] {
    const edgeIds = this.adjacency.get(nodeId) ?? new Set<string>();
    return Array.from(edgeIds).map(eid => this.edges.get(eid)!).filter(Boolean);
  }

  /** Returns all neighbors (target nodes) of a given node */
  neighbors(nodeId: string): GraphNode[] {
    return this.edgesFrom(nodeId)
      .map(e => this.nodes.get(e.toNodeId))
      .filter(Boolean) as GraphNode[];
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Find nodes by label (partial match) */
  findByLabel(query: string): GraphNode[] {
    const q = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(n => n.label.toLowerCase().includes(q));
  }

  /** Find nodes by property value */
  findByProperty(key: string, value: unknown): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.properties[key] === value);
  }

  /** Shortest path via BFS (returns node ID path) */
  shortestPath(fromId: string, toId: string): string[] {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return [];
    if (fromId === toId) return [fromId];
    const visited = new Set<string>([fromId]);
    const queue: string[][] = [[fromId]];
    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];
      for (const edge of this.edgesFrom(current)) {
        const next = edge.toNodeId;
        if (next === toId) return [...path, next];
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    return []; // no path found
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  get nodeCount(): number { return this.nodes.size; }
  get edgeCount(): number { return this.edges.size; }

  stats(): Record<string, number> {
    const typeCounts: Record<string, number> = {};
    for (const node of this.nodes.values()) {
      typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1;
    }
    return { total: this.nodes.size, edges: this.edges.size, ...typeCounts };
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }
}