/**
 * ReasoningRuleRegistry.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Centralizes rule registration, ordering and execution.
 * MemoryReasoningEngine never knows individual rules — it calls the registry.
 * New rules: register here. Engine is never modified.
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type { ReasoningRule, RuleApplicationResult, ReasoningSession, ReasoningConflict, ReasoningHypothesis, EvidenceRelationship } from "../MRETypes";

// ── Aggregated result type ────────────────────────────────────────────────────

export interface AggregatedRuleResult {
  appliedRuleIds: string[];
  conflicts:      ReasoningConflict[];
  hypotheses:     ReasoningHypothesis[];
  adjustments:    Map<string, number>;
  discards:       Map<string, string>;
  relationships:  EvidenceRelationship[];
  notes:          string[];
}

// ── Registry implementation ───────────────────────────────────────────────────

class ReasoningRuleRegistryImpl {
  private readonly _rules: Map<string, { rule: ReasoningRule; order: number }> = new Map();

  register(rule: ReasoningRule, order = 100): void {
    this._rules.set(rule.id, { rule, order });
  }

  unregister(id: string): void {
    this._rules.delete(id);
  }

  has(id: string): boolean {
    return this._rules.has(id);
  }

  get size(): number { return this._rules.size; }

  listIds(): string[] {
    return [...this._rules.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id]) => id);
  }

  /**
   * Execute all registered rules in order.
   * Results are merged into a single aggregate.
   */
  applyAll(
    evidence: MemoryEvidence[],
    session: ReasoningSession,
  ): AggregatedRuleResult {
    const ordered = [...this._rules.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([, { rule }]) => rule);

    const aggregate: AggregatedRuleResult = {
      appliedRuleIds: [],
      conflicts:      [],
      hypotheses:     [],
      adjustments:    new Map(),
      discards:       new Map(),
      relationships:  [],
      notes:          [],
    };

    for (const rule of ordered) {
      try {
        const result: RuleApplicationResult = rule.apply(evidence, session);
        aggregate.appliedRuleIds.push(result.ruleId);
        aggregate.conflicts.push(...result.conflicts);
        aggregate.hypotheses.push(...result.hypotheses);
        aggregate.relationships.push(...result.relationships);
        aggregate.notes.push(...result.notes);
        result.adjustments.forEach((v, k) => aggregate.adjustments.set(k, v));
        result.discards.forEach((v, k) => aggregate.discards.set(k, v));
      } catch (e) {
        aggregate.notes.push(`Rule ${rule.id} failed: ${String(e)}`);
      }
    }

    return aggregate;
  }
}

// ── Singleton (HMR-safe) ──────────────────────────────────────────────────────

const REGISTRY_KEY = "__MRE_RULE_REGISTRY_V1__";
type GlobalWithRegistry = typeof globalThis & Record<string, unknown>;

export const ReasoningRuleRegistry: ReasoningRuleRegistryImpl = (() => {
  const g = globalThis as GlobalWithRegistry;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new ReasoningRuleRegistryImpl();
  return g[REGISTRY_KEY] as ReasoningRuleRegistryImpl;
})();