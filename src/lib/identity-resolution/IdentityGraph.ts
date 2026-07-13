/**
 * IdentityGraph.ts — Identity Graph
 * EF-36E · Project Independence · Foundation v1.0
 * 2026-07-13
 *
 * Stores IdentityNodes and IdentityEdges.
 * Supports: canonical, alias, version, provider_ref node kinds.
 * Supports: sameAs, versionOf, implementedBy, discussedIn, documentedBy,
 *           decidedBy, referencedBy, aliasOf edge types.
 * Does NOT duplicate KnowledgeGraph — this is identity-specific.
 */

import type { IdentityNode, IdentityEdge, IdentityEdgeType } from "./IRTypes";
import { makeIRId } from "./IRTypes";

export class IdentityGraph {
  private readonly nodes = new Map<string, IdentityNode>();
  private readonly edges = new Map<string, IdentityEdge>();
  private readonly adjacency = new Map<string, Set<string>>();

  // ── Nodes ──────────────────────────────────────────────────────────────────

  addNode(
    kind: IdentityNode["kind"],
    label: string,
    canonicalId: string,
    metadata: Record<string, unknown> = {},
    existingId?: string,
  ): IdentityNode {
    const id = existingId ?? makeIRId("inode");
    const node: IdentityNode = Object.freeze({
      id, kind, label, canonicalId,
      metadata: Object.freeze({ ...metadata }),
      createdAt: Date.now(),
    });
    this.nodes.set(id, node);
    if (!this.adjacency.has(id)) this.adjacency.set(id, new Set());
    return node;
  }

  hasNode(id: string): boolean { return this.nodes.has(id); }
  getNode(id: string): IdentityNode | undefined { return this.nodes.get(id); }
  listNodes(kind?: IdentityNode["kind"]): IdentityNode[] {
    const all = Array.from(this.nodes.values());
    return kind ? all.filter(n => n.kind === kind) : all;
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  addEdge(fromId: string, toId: string, edgeType: IdentityEdgeType, weight = 1.0): IdentityEdge | null {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;
    const id = makeIRId("iedge");
    const edge: IdentityEdge = Object.freeze({ id, fromId, toId, edgeType, weight, createdAt: Date.now() });
    this.edges.set(id, edge);
    const adj = this.adjacency.get(fromId) ?? new Set<string>();
    adj.add(id);
    this.adjacency.set(fromId, adj);
    return edge;
  }

  listEdges(type?: IdentityEdgeType): IdentityEdge[] {
    const all = Array.from(this.edges.values());
    return type ? all.filter(e => e.edgeType === type) : all;
  }

  edgesFrom(nodeId: string): IdentityEdge[] {
    const ids = this.adjacency.get(nodeId) ?? new Set<string>();
    return [...ids].map(id => this.edges.get(id)!).filter(Boolean);
  }

  /** All canonical nodes directly connected to a given canonical node */
  neighbors(canonicalId: string): IdentityNode[] {
    return this.edgesFrom(canonicalId)
      .map(e => this.nodes.get(e.toId))
      .filter(Boolean) as IdentityNode[];
  }

  /** Find alias nodes for a canonical entity */
  aliasesOf(canonicalId: string): IdentityNode[] {
    return this.listNodes("alias").filter(n => n.canonicalId === canonicalId);
  }

  /** Find version nodes for a canonical entity */
  versionsOf(canonicalId: string): IdentityNode[] {
    return this.listNodes("version").filter(n => n.canonicalId === canonicalId);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  get nodeCount(): number { return this.nodes.size; }
  get edgeCount(): number { return this.edges.size; }

  stats(): Record<string, number> {
    const kinds: Record<string, number> = {};
    for (const n of this.nodes.values()) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    const types: Record<string, number> = {};
    for (const e of this.edges.values()) types[e.edgeType] = (types[e.edgeType] ?? 0) + 1;
    return { nodes: this.nodes.size, edges: this.edges.size, ...kinds, ...types };
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }
}