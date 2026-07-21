/**
 * ReasoningGraph.ts — Sprint EF-52
 *
 * SRP: construir um grafo temporário da inferência.
 *
 * Nodes: knowledge, inference, decision, conflict, context
 * Edges: supports, contradicts, requires, derived_from, related_to
 *
 * Grafo é TEMPORÁRIO (isTemporary: true) — destruído após execução.
 */

import type {
  RetrievedRule, InferenceChain, ReasoningDecision, Conflict,
  ReasoningGraph as IReasoningGraph, ReasoningNode, ReasoningEdge,
  ReasoningContext,
} from "./KRTypes";
import { makeKRId } from "./KRTypes";

export class ReasoningGraphBuilder {
  build(opts: {
    ctx:      ReasoningContext;
    rules:    readonly RetrievedRule[];
    chain:    InferenceChain;
    decision: ReasoningDecision;
    conflicts: readonly Conflict[];
  }): IReasoningGraph {
    const { ctx, rules, chain, decision, conflicts } = opts;
    const nodes: ReasoningNode[] = [];
    const edges: ReasoningEdge[] = [];

    // Context node
    const ctxNodeId = makeKRId("node");
    nodes.push(Object.freeze({ id: ctxNodeId, kind: "context", label: `Goal: ${ctx.goal}`, confidence: 1, isTemporary: true }));

    // Knowledge nodes (retrieved rules)
    const ruleNodeMap = new Map<string, string>();
    for (const rule of rules) {
      const nodeId = makeKRId("node");
      ruleNodeMap.set(rule.ruleId, nodeId);
      nodes.push(Object.freeze({
        id: nodeId, kind: "knowledge",
        label: rule.title, confidence: rule.confidence, isTemporary: true,
      }));
      edges.push(Object.freeze({ from: ctxNodeId, to: nodeId, relation: "requires", weight: rule.relevanceScore }));
    }

    // Inference nodes
    const stepNodeIds: string[] = [];
    for (const step of chain.steps) {
      const nodeId = makeKRId("node");
      stepNodeIds.push(nodeId);
      nodes.push(Object.freeze({
        id: nodeId, kind: "inference",
        label: `[${step.type}] ${step.conclusion.slice(0, 60)}`,
        confidence: step.confidence, isTemporary: true,
      }));
      // Edges from premise rules to inference
      for (const premiseId of step.premiseRuleIds) {
        const fromId = ruleNodeMap.get(premiseId);
        if (fromId) {
          edges.push(Object.freeze({ from: fromId, to: nodeId, relation: "supports", weight: step.confidence }));
        }
      }
      // Chain: previous inference → this inference
      if (stepNodeIds.length > 1) {
        edges.push(Object.freeze({
          from: stepNodeIds[stepNodeIds.length - 2], to: nodeId,
          relation: "derived_from", weight: 0.8,
        }));
      }
    }

    // Conflict nodes
    for (const conflict of conflicts) {
      const nodeId = makeKRId("node");
      nodes.push(Object.freeze({
        id: nodeId, kind: "conflict",
        label: `Conflict: ${conflict.ruleATitle} ↔ ${conflict.ruleBTitle}`,
        confidence: 0, isTemporary: true,
      }));
      const nA = ruleNodeMap.get(conflict.ruleAId);
      const nB = ruleNodeMap.get(conflict.ruleBId);
      if (nA) edges.push(Object.freeze({ from: nA, to: nodeId, relation: "contradicts", weight: 1 }));
      if (nB) edges.push(Object.freeze({ from: nB, to: nodeId, relation: "contradicts", weight: 1 }));
    }

    // Decision node
    const decNodeId = makeKRId("node");
    nodes.push(Object.freeze({
      id: decNodeId, kind: "decision",
      label: `Decision: ${decision.conclusion.slice(0, 60)}`,
      confidence: decision.confidence, isTemporary: true,
    }));
    // Last inference step → decision
    if (stepNodeIds.length > 0) {
      edges.push(Object.freeze({
        from: stepNodeIds[stepNodeIds.length - 1], to: decNodeId,
        relation: "derived_from", weight: decision.confidence,
      }));
    }

    return Object.freeze({
      id:          makeKRId("rg"),
      builtAt:     Date.now(),
      contextId:   ctx.id,
      nodes:       Object.freeze(nodes),
      edges:       Object.freeze(edges),
      isTemporary: true as const,
    });
  }
}