/**
 * BuiltInRules.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Built-in reasoning rules. Each rule is independent.
 * Import this file once to register them in the Rule Registry.
 * Engine never references these directly.
 */

import type { ReasoningRule, RuleApplicationResult, ReasoningSession } from "../MRETypes";
import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import { ReasoningRuleRegistry } from "./ReasoningRuleRegistry";
import { EvidenceAnalyzer }      from "../EvidenceAnalyzer";
import { ConflictResolver }       from "../ConflictResolver";
import { HypothesisGenerator }    from "../HypothesisGenerator";
import { DEFAULT_CONFIDENCE_POLICY } from "../policies/ConfidencePolicy";
import { ConfidenceAdjuster }     from "../ConfidenceAdjuster";

function emptyResult(ruleId: string, notes: string[] = []): RuleApplicationResult {
  return { ruleId, conflicts: [], hypotheses: [], adjustments: new Map(), discards: new Map(), relationships: [], notes };
}

// ── Rule: Relationship Analysis ───────────────────────────────────────────────

const RelationshipRule: ReasoningRule = {
  id:          "R-RELATIONSHIP",
  description: "Analyze pairwise relationships between evidence items",
  apply(evidence: MemoryEvidence[], _session: ReasoningSession): RuleApplicationResult {
    const rels    = EvidenceAnalyzer.analyzeRelationships(evidence);
    const flat    = [...rels.entries()].flatMap(([, rs]) => rs);
    return { ...emptyResult("R-RELATIONSHIP"), relationships: flat };
  },
};

// ── Rule: Conflict Detection ───────────────────────────────────────────────────

const ConflictDetectionRule: ReasoningRule = {
  id:          "R-CONFLICT",
  description: "Detect and resolve cross-provider conflicts",
  apply(evidence: MemoryEvidence[], _session: ReasoningSession): RuleApplicationResult {
    const rawConflicts = EvidenceAnalyzer.detectConflicts(evidence);
    const conflicts    = rawConflicts.map(({ a, b, sim }) =>
      ConflictResolver.resolve(
        a, b,
        `"${a.providerName}" and "${b.providerName}" disagree (similarity: ${(sim * 100).toFixed(0)}%)`
      )
    );
    return { ...emptyResult("R-CONFLICT"), conflicts };
  },
};

// ── Rule: Confidence Adjustment ───────────────────────────────────────────────

const ConfidenceRule: ReasoningRule = {
  id:          "R-CONFIDENCE",
  description: "Adjust confidence based on corroboration, recency and conflicts",
  apply(evidence: MemoryEvidence[], _session: ReasoningSession): RuleApplicationResult {
    // Detect conflicting ids first (lightweight re-run)
    const rawConflicts  = EvidenceAnalyzer.detectConflicts(evidence);
    const conflictingIds = new Set(rawConflicts.flatMap(c => [c.a.memoryId, c.b.memoryId]));
    const rels          = EvidenceAnalyzer.analyzeRelationships(evidence);
    const adjustments   = ConfidenceAdjuster.adjust(evidence, rels, conflictingIds, DEFAULT_CONFIDENCE_POLICY);
    return { ...emptyResult("R-CONFIDENCE"), adjustments };
  },
};

// ── Rule: Hypothesis Generation ──────────────────────────────────────────────

const HypothesisRule: ReasoningRule = {
  id:          "R-HYPOTHESIS",
  description: "Generate hypotheses when evidence is insufficient",
  apply(evidence: MemoryEvidence[], session: ReasoningSession): RuleApplicationResult {
    const hypotheses = HypothesisGenerator.generate(evidence, session.query);
    return { ...emptyResult("R-HYPOTHESIS"), hypotheses };
  },
};

// ── Register all built-in rules ───────────────────────────────────────────────

export function registerBuiltInRules(): void {
  if (!ReasoningRuleRegistry.has("R-RELATIONSHIP")) ReasoningRuleRegistry.register(RelationshipRule, 10);
  if (!ReasoningRuleRegistry.has("R-CONFLICT"))     ReasoningRuleRegistry.register(ConflictDetectionRule, 20);
  if (!ReasoningRuleRegistry.has("R-CONFIDENCE"))   ReasoningRuleRegistry.register(ConfidenceRule, 30);
  if (!ReasoningRuleRegistry.has("R-HYPOTHESIS"))   ReasoningRuleRegistry.register(HypothesisRule, 40);
}