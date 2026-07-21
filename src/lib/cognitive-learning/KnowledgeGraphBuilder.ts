/**
 * KnowledgeGraphBuilder.ts — Sprint EF-51
 *
 * SRP: construir um KnowledgeGraph navegável a partir das KnowledgeRules.
 *
 * Produz nodes e edges tipados.
 * NÃO armazena nada — retorna o grafo imutável.
 */

import type { KnowledgeRule, KnowledgeGraph, KnowledgeNode, KnowledgeEdge } from "./CLTypes";
import { makeCLId } from "./CLTypes";

type NodeKind = KnowledgeNode["kind"];

function kindFromPattern(patternKind: string): NodeKind {
  if (patternKind === "failure_pattern" || patternKind === "error_pattern") return "anti_pattern";
  if (patternKind === "success_pattern") return "pattern";
  if (patternKind === "capability_sequence") return "capability";
  if (patternKind === "connector_chain") return "connector";
  if (patternKind === "goal_type") return "goal";
  return "strategy";
}

export class KnowledgeGraphBuilder {
  /**
   * Build a navigable KnowledgeGraph from promoted rules.
   */
  build(rules: readonly KnowledgeRule[]): KnowledgeGraph {
    const nodes: KnowledgeNode[] = [];
    const edges: KnowledgeEdge[] = [];
    const ruleToNodeId = new Map<string, string>();

    // Build nodes
    for (const rule of rules) {
      const nodeId = makeCLId("node");
      ruleToNodeId.set(rule.id, nodeId);
      nodes.push(Object.freeze({
        id:     nodeId,
        ruleId: rule.id,
        label:  rule.title,
        kind:   kindFromPattern(rule.patternId.includes("pat_") ? "pattern" : "pattern"),
        weight: rule.confidence * rule.successRate,
      }));
    }

    // Build edges between rules sharing episode origins
    const processed = new Set<string>();
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rA = rules[i];
        const rB = rules[j];
        const edgeKey = `${rA.id}:${rB.id}`;
        if (processed.has(edgeKey)) continue;
        processed.add(edgeKey);

        const shared = rA.originEpisodeIds.filter(id => rB.originEpisodeIds.includes(id)).length;
        if (shared === 0) continue;

        const fromId = ruleToNodeId.get(rA.id)!;
        const toId   = ruleToNodeId.get(rB.id)!;
        const weight = shared / Math.max(rA.originEpisodeIds.length, rB.originEpisodeIds.length);

        edges.push(Object.freeze({
          from:     fromId,
          to:       toId,
          relation: "derives_from",
          weight,
        }));

        // If A is success and B is anti_pattern, add conflict edge
        if (rA.successRate > 0.7 && rB.successRate < 0.4) {
          edges.push(Object.freeze({
            from:     fromId,
            to:       toId,
            relation: "conflicts_with",
            weight:   1 - rB.successRate,
          }));
        }

        // Reinforces edge when both are success patterns
        if (rA.successRate > 0.7 && rB.successRate > 0.7) {
          edges.push(Object.freeze({
            from:     fromId,
            to:       toId,
            relation: "reinforces",
            weight,
          }));
        }
      }
    }

    return Object.freeze({
      id:      makeCLId("kg"),
      builtAt: Date.now(),
      nodes:   Object.freeze(nodes),
      edges:   Object.freeze(edges),
    });
  }
}