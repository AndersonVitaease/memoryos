/**
 * ExecutionDependencyResolver.ts — Engineering Sprint 8.0
 * Resolves inter-connector dependencies and injects outputs
 * from upstream nodes into downstream node parameters.
 *
 * Rule: No connector calls another connector.
 * All coordination happens here, in the MCOE layer exclusively.
 */

import type { ExecutionNode, ExecutionNodeResult } from "./MultiConnectorExecutionPlan";

export interface ResolvedParameters {
  nodeId:     string;
  parameters: Record<string, unknown>;
  injected:   string[];  // keys injected from upstream results
}

// ── Dependency injection rules ─────────────────────────────────────────────────

type InjectionRule = {
  sourceNodeId:  string;
  sourceField:   string[];    // path into output (dot notation)
  targetField:   string;
};

export class ExecutionDependencyResolver {

  private rules: Map<string, InjectionRule[]> = new Map();

  /**
   * Register an injection rule:
   * When targetNodeId executes, inject a value from sourceNodeId's output.
   */
  addRule(targetNodeId: string, rule: InjectionRule): void {
    const existing = this.rules.get(targetNodeId) ?? [];
    existing.push(rule);
    this.rules.set(targetNodeId, existing);
  }

  /**
   * Resolve parameters for a node, injecting values from completed results.
   */
  resolve(node: ExecutionNode, completedResults: Map<string, ExecutionNodeResult>): ResolvedParameters {
    const params  = { ...node.parameters };
    const injected: string[] = [];
    const nodeRules = this.rules.get(node.id) ?? [];

    for (const rule of nodeRules) {
      const sourceResult = completedResults.get(rule.sourceNodeId);
      if (!sourceResult || sourceResult.status !== "success") continue;
      const value = _extractPath(sourceResult.output, rule.sourceField);
      if (value !== undefined) {
        params[rule.targetField] = value;
        injected.push(`${rule.sourceNodeId}.${rule.sourceField.join(".")} → ${rule.targetField}`);
      }
    }

    return { nodeId: node.id, parameters: params, injected };
  }

  /**
   * Check if all dependencies of a node are satisfied.
   */
  canExecute(node: ExecutionNode, completedResults: Map<string, ExecutionNodeResult>): boolean {
    return node.dependsOn.every((depId) => {
      const r = completedResults.get(depId);
      return r && (r.status === "success" || r.status === "failed"); // failed deps don't block (partial exec)
    });
  }
}

function _extractPath(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}