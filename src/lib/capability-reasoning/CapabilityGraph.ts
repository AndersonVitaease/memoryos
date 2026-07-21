/**
 * CapabilityGraph.ts — Sprint EF-48 · Capability Reasoning Engine
 *
 * SRP: tipos imutáveis que representam o grafo de capacidades necessárias
 *      para resolver um objetivo.
 *
 * NÃO contém lógica de raciocínio, seleção de conectores nem geração de estratégias.
 * Apenas o modelo de dados e helpers.
 */

import { makeCOId } from "@/lib/cognitive-orchestrator/COTypes";

// ── Capability node ───────────────────────────────────────────────────────────

export type CapabilityStatus = "required" | "optional" | "recommended";
export type CapabilityCategory =
  | "read"        // fetching / reading data
  | "write"       // writing / creating data
  | "transform"   // converting / normalising content
  | "analyze"     // analysis, reasoning, evaluation
  | "compare"     // diffing / comparing artefacts
  | "search"      // querying / searching
  | "validate"    // verifying correctness
  | "synthesize"  // combining into a final answer
  | "orchestrate";// coordinating multi-step flows

export interface CapabilityNode {
  readonly capabilityId:        string;
  readonly capabilityName:      string;
  readonly description:         string;
  readonly category:            CapabilityCategory;
  readonly status:              CapabilityStatus;
  readonly confidence:          number;           // 0–1
  readonly dependencies:        readonly string[]; // capabilityIds this node needs first
  readonly compatibleConnectors: readonly string[];// connector names that satisfy this cap
  readonly estimatedCostScore:  number;           // 0–10
  readonly estimatedComplexity: number;           // 1–10
  readonly parallelizable:      boolean;          // can run concurrently with siblings
  readonly prerequisitesMet:    boolean;          // all dependency nodes present
}

// ── Capability graph ──────────────────────────────────────────────────────────

export interface CapabilityGraph {
  readonly graphId:            string;
  readonly goalId:             string;
  readonly nodes:              readonly CapabilityNode[];
  readonly orderedNodeIds:     readonly string[];  // topological execution order
  readonly requiredNodes:      readonly CapabilityNode[];
  readonly optionalNodes:      readonly CapabilityNode[];
  readonly totalEstimatedCost: number;
  readonly totalComplexity:    number;
  readonly averageConfidence:  number;
  readonly uniqueConnectors:   readonly string[];
  readonly durationMs:         number;
  readonly createdAt:          string;
}

// ── Factories ─────────────────────────────────────────────────────────────────

export function makeCapabilityId(): string { return makeCOId("cap"); }
export function makeGraphId():      string { return makeCOId("cgraph"); }

export function makeCapabilityNode(
  name:    string,
  partial: Partial<Omit<CapabilityNode, "capabilityId" | "capabilityName">>,
): CapabilityNode {
  return Object.freeze({
    capabilityId:         makeCapabilityId(),
    capabilityName:       name,
    description:          partial.description         ?? `Capability: ${name}`,
    category:             partial.category            ?? "orchestrate",
    status:               partial.status              ?? "required",
    confidence:           partial.confidence          ?? 0.85,
    dependencies:         Object.freeze(partial.dependencies         ?? []),
    compatibleConnectors: Object.freeze(partial.compatibleConnectors ?? []),
    estimatedCostScore:   partial.estimatedCostScore  ?? 2,
    estimatedComplexity:  partial.estimatedComplexity ?? 3,
    parallelizable:       partial.parallelizable      ?? false,
    prerequisitesMet:     partial.prerequisitesMet    ?? true,
  });
}

// Build a CapabilityGraph from an ordered list of nodes
export function buildCapabilityGraph(
  goalId:    string,
  nodes:     CapabilityNode[],
  durationMs:number,
): CapabilityGraph {
  const required = nodes.filter(n => n.status === "required");
  const optional = nodes.filter(n => n.status !== "required");

  const totalCost      = nodes.reduce((a, n) => a + n.estimatedCostScore,  0);
  const totalComplexity= nodes.reduce((a, n) => a + n.estimatedComplexity, 0);
  const avgConfidence  = nodes.length
    ? Math.round((nodes.reduce((a, n) => a + n.confidence, 0) / nodes.length) * 100) / 100
    : 0;

  const uniqueConnectors = [...new Set(nodes.flatMap(n => n.compatibleConnectors))];

  // Topological order: nodes with no dependencies first, then by dependency chain
  const orderedNodeIds = topoSort(nodes);

  return Object.freeze({
    graphId:            makeGraphId(),
    goalId,
    nodes:              Object.freeze(nodes),
    orderedNodeIds:     Object.freeze(orderedNodeIds),
    requiredNodes:      Object.freeze(required),
    optionalNodes:      Object.freeze(optional),
    totalEstimatedCost: totalCost,
    totalComplexity,
    averageConfidence:  avgConfidence,
    uniqueConnectors:   Object.freeze(uniqueConnectors),
    durationMs,
    createdAt:          new Date().toISOString(),
  });
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────

function topoSort(nodes: CapabilityNode[]): string[] {
  const nameToId  = new Map(nodes.map(n => [n.capabilityName, n.capabilityId]));
  const inDegree  = new Map(nodes.map(n => [n.capabilityId, 0]));
  const adjList   = new Map(nodes.map(n => [n.capabilityId, [] as string[]]));

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const depId = nameToId.get(dep) ?? dep;
      if (inDegree.has(depId)) {
        inDegree.set(node.capabilityId, (inDegree.get(node.capabilityId) ?? 0) + 1);
        adjList.get(depId)?.push(node.capabilityId);
      }
    }
  }

  const queue  = nodes.filter(n => (inDegree.get(n.capabilityId) ?? 0) === 0).map(n => n.capabilityId);
  const result: string[] = [];

  while (queue.length) {
    const cur = queue.shift()!;
    result.push(cur);
    for (const next of adjList.get(cur) ?? []) {
      inDegree.set(next, (inDegree.get(next) ?? 1) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  // Append any unresolved (cycles or missing deps) at the end
  for (const node of nodes) {
    if (!result.includes(node.capabilityId)) result.push(node.capabilityId);
  }

  return result;
}