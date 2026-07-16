/**
 * ConnectorExecutionGraph.ts — Engineering Sprint 8.0
 * DAG (Directed Acyclic Graph) for multi-connector execution.
 * Pure data structure — no side effects.
 */

import type { ExecutionNode } from "./MultiConnectorExecutionPlan";

export interface GraphLayer {
  layerIndex: number;
  nodes:      ExecutionNode[];   // can run in parallel within the layer
}

export interface ExecutionGraph {
  layers:     GraphLayer[];
  nodeMap:    Map<string, ExecutionNode>;
  edgeCount:  number;
  hasCycles:  boolean;
}

// ── Build layered DAG from node list ──────────────────────────────────────────

export function buildExecutionGraph(nodes: ExecutionNode[]): ExecutionGraph {
  const nodeMap = new Map<string, ExecutionNode>(nodes.map((n) => [n.id, n]));

  // Detect cycles via DFS
  const visited  = new Set<string>();
  const inStack  = new Set<string>();
  let hasCycles  = false;

  function dfs(id: string): void {
    if (inStack.has(id)) { hasCycles = true; return; }
    if (visited.has(id)) return;
    inStack.add(id);
    visited.add(id);
    const node = nodeMap.get(id);
    if (node) node.dependsOn.forEach(dfs);
    inStack.delete(id);
  }
  nodes.forEach((n) => dfs(n.id));

  // Topological sort → assign layer index
  const layerOf = new Map<string, number>();

  function getLayer(id: string): number {
    if (layerOf.has(id)) return layerOf.get(id)!;
    const node = nodeMap.get(id);
    if (!node || node.dependsOn.length === 0) { layerOf.set(id, 0); return 0; }
    const maxDepLayer = Math.max(...node.dependsOn.map(getLayer));
    const layer = maxDepLayer + 1;
    layerOf.set(id, layer);
    return layer;
  }
  nodes.forEach((n) => getLayer(n.id));

  // Group by layer
  const maxLayer  = Math.max(0, ...Array.from(layerOf.values()));
  const layers: GraphLayer[] = Array.from({ length: maxLayer + 1 }, (_, i) => ({ layerIndex: i, nodes: [] }));
  nodes.forEach((n) => layers[layerOf.get(n.id)!].nodes.push(n));

  const edgeCount = nodes.reduce((s, n) => s + n.dependsOn.length, 0);
  return { layers, nodeMap, edgeCount, hasCycles };
}

// ── Render ASCII graph (for dashboard) ────────────────────────────────────────

export function renderGraphASCII(graph: ExecutionGraph): string {
  return graph.layers.map((l) => {
    const nodeStr = l.nodes.map((n) => `[${n.connectorId}:${n.capabilityId.split(".")[1]}]`).join("  ║  ");
    return `Layer ${l.layerIndex}: ${nodeStr}`;
  }).join("\n    ↓\n");
}