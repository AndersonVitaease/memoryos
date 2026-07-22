/**
 * KnowledgeStore.ts — Sprint EF-51
 *
 * SRP: repositório cognitivo independente para KnowledgeRules validadas.
 *
 * Independente do EpisodeStore.
 * Append-only com controle de revisão.
 * HMR-safe singleton via globalThis.
 */

import type { KnowledgeRule, KnowledgeStatus } from "./CLTypes";
import { makeCLId } from "./CLTypes";

class KnowledgeStoreImpl {
  private _rules: Map<string, KnowledgeRule> = new Map();
  // NC-07 remediation: expose lastWriteId for certification traceability (knowledge_store artifactId)
  private _lastWriteId: string = "none";

  /** Add a new rule (status=validated). Returns the stored rule. */
  add(rule: KnowledgeRule): KnowledgeRule {
    const stored: KnowledgeRule = Object.freeze({
      ...rule,
      status:    "validated" as KnowledgeStatus,
      updatedAt: Date.now(),
    });
    this._rules.set(stored.id, stored);
    this._lastWriteId = stored.id; // NC-07: expose last write for certification traceability
    return stored;
  }

  /** Promote a rule to status=promoted. */
  promote(ruleId: string): KnowledgeRule | null {
    const existing = this._rules.get(ruleId);
    if (!existing) return null;
    const promoted: KnowledgeRule = Object.freeze({
      ...existing,
      status:    "promoted" as KnowledgeStatus,
      promotedAt: Date.now(),
      updatedAt:  Date.now(),
      revision:   existing.revision + 1,
    });
    this._rules.set(ruleId, promoted);
    return promoted;
  }

  /** Deprecate a rule. */
  deprecate(ruleId: string, reason: string): KnowledgeRule | null {
    const existing = this._rules.get(ruleId);
    if (!existing) return null;
    const deprecated: KnowledgeRule = Object.freeze({
      ...existing,
      status:            "deprecated" as KnowledgeStatus,
      deprecatedAt:      Date.now(),
      deprecationReason: reason,
      updatedAt:         Date.now(),
      revision:          existing.revision + 1,
    });
    this._rules.set(ruleId, deprecated);
    return deprecated;
  }

  /** Update confidence/authority of an existing rule (incremental learning). */
  update(ruleId: string, patch: Partial<Pick<KnowledgeRule, "confidence" | "authority" | "successRate" | "frequency">>): KnowledgeRule | null {
    const existing = this._rules.get(ruleId);
    if (!existing) return null;
    const updated: KnowledgeRule = Object.freeze({
      ...existing,
      ...patch,
      updatedAt: Date.now(),
      revision:  existing.revision + 1,
    });
    this._rules.set(ruleId, updated);
    return updated;
  }

  /** Get all rules, optionally filtered by status. */
  getAll(status?: KnowledgeStatus): readonly KnowledgeRule[] {
    const all = [...this._rules.values()];
    return status ? all.filter(r => r.status === status) : all;
  }

  /** Get a specific rule. */
  get(ruleId: string): KnowledgeRule | undefined {
    return this._rules.get(ruleId);
  }

  /** Find rules by pattern id. */
  findByPattern(patternId: string): readonly KnowledgeRule[] {
    return [...this._rules.values()].filter(r => r.patternId === patternId);
  }

  /** Total count. */
  get size(): number { return this._rules.size; }

  /** NC-07: Last written rule ID — for certification traceability. "none" if empty. */
  get lastWriteId(): string { return this._lastWriteId; }

  /** Clear — for testing only. */
  clear(): void { this._rules.clear(); }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF51_KS__?: KnowledgeStoreImpl };
if (!G.__EF51_KS__) G.__EF51_KS__ = new KnowledgeStoreImpl();
export const KnowledgeStore: KnowledgeStoreImpl = G.__EF51_KS__;