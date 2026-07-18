/**
 * MemoryReasoningEngine.ts — MRE v1.1 (Sprint EF-7.1.1)
 *
 * Changes from v1.0:
 *   - Uses ReasoningRuleRegistry (no hardcoded RULES_APPLIED list)
 *   - Duplicate handling → Merge (not silent discard); MergedEvidence audit trail
 *   - Produces structuredContext alongside plain context string
 *   - Corroboration computed explicitly, passed to ConflictResolver
 *   - No ConfidencePolicy constants inline — all via ConfidenceAdjuster(policy)
 *
 * Invariants (unchanged):
 *   ✓ Does NOT call any MemoryProvider
 *   ✓ Does NOT invent facts
 *   ✓ Every discard/merge is justified and auditable
 *   ✓ Every conflict preserved and explained
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type {
  ReasoningSession,
  ReasoningResult,
  ReasoningEvidence,
  ReasoningConflict,
  EvidenceRole,
  MergedEvidence,
  EvidenceCorroboration,
} from "./MRETypes";
import { EvidenceAnalyzer }            from "./EvidenceAnalyzer";
import { ConflictResolver }             from "./ConflictResolver";
import { HypothesisGenerator }          from "./HypothesisGenerator";
import { ConfidenceAdjuster }           from "./ConfidenceAdjuster";
import { ExplanationBuilder }           from "./ExplanationBuilder";
import { DEFAULT_CONFIDENCE_POLICY }    from "./policies/ConfidencePolicy";
import { ReasoningRuleRegistry }        from "./rules/ReasoningRuleRegistry";
import { registerBuiltInRules }         from "./rules/BuiltInRules";
import { defaultSimilarityEngine }      from "./similarity/SimilarityEngine";

// Ensure built-in rules are registered
registerBuiltInRules();

let _seq = 1;
function sid() { return `session-${Date.now()}-${_seq++}`; }

// ── Corroboration helper ──────────────────────────────────────────────────────

function computeCorroboration(
  ev: MemoryEvidence,
  evidence: MemoryEvidence[],
  relationships: Map<string, Array<{ type: string; targetId: string }>>,
  totalProviders: number,
): EvidenceCorroboration {
  const rels = relationships.get(ev.memoryId) ?? [];
  const agreeing = rels.filter(r => r.type === "complements" || r.type === "duplicates");
  const uniqueProviders = new Set(
    agreeing.map(r => evidence.find(e => e.memoryId === r.targetId)?.providerId).filter(Boolean)
  ).size;
  return {
    sourceCount:        uniqueProviders + 1,     // +1 for self
    corroborationCount: agreeing.length,
    providerAgreement:  totalProviders > 0 ? (uniqueProviders + 1) / totalProviders : 0,
  };
}

// ── Merge duplicates (Sprint 7.1.1) ──────────────────────────────────────────

function mergeDuplicates(
  evidence: MemoryEvidence[],
  relationships: Map<string, Array<{ type: string; targetId: string; strength: number }>>,
  adjustments: Map<string, number>,
): { merged: Set<string>; mergeRecords: MergedEvidence[] } {
  const merged      = new Set<string>();
  const mergeRecords: MergedEvidence[] = [];
  const visited     = new Set<string>();

  for (const ev of evidence) {
    if (visited.has(ev.memoryId) || merged.has(ev.memoryId)) continue;
    visited.add(ev.memoryId);

    const dupRels = (relationships.get(ev.memoryId) ?? []).filter(r => r.type === "duplicates");
    if (dupRels.length === 0) continue;

    // Find all duplicates of this item
    const dupIds = dupRels.map(r => r.targetId).filter(id => !merged.has(id));
    if (dupIds.length === 0) continue;

    const myConf    = adjustments.get(ev.memoryId) ?? ev.confidence;
    const allConfs  = dupIds.map(id => adjustments.get(id) ?? evidence.find(e => e.memoryId === id)?.confidence ?? 0);
    const maxDupConf = Math.max(...allConfs);

    if (myConf >= maxDupConf) {
      // This item is the primary — absorb duplicates
      for (const id of dupIds) { merged.add(id); visited.add(id); }
      mergeRecords.push({
        primaryId:    ev.memoryId,
        mergedIds:    dupIds,
        supportCount: dupIds.length + 1,
        explanation:  `${dupIds.length} duplicate(s) merged into "${ev.providerName}" (highest confidence: ${(myConf * 100).toFixed(0)}%)`,
      });
    } else {
      // A duplicate has higher confidence — it will be the primary when processed
      // Just mark this item for later merge
    }
  }

  return { merged, mergeRecords };
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export const MemoryReasoningEngine = {

  reason(query: string, evidence: MemoryEvidence[]): ReasoningResult {
    const t0 = Date.now();
    const session: ReasoningSession = {
      id: sid(), query, startedAt: new Date().toISOString(), evidence, durationMs: 0,
    };

    const policy          = DEFAULT_CONFIDENCE_POLICY;
    const totalProviders  = new Set(evidence.map(e => e.providerId)).size;

    // ── Step 1: Relationships via SimilarityEngine ────────────────────────────
    const relationshipMap = EvidenceAnalyzer.analyzeRelationships(evidence, defaultSimilarityEngine, policy);

    // ── Step 2: Rule Registry (replaces hardcoded RULES_APPLIED) ─────────────
    const ruleOutput = ReasoningRuleRegistry.applyAll(evidence, session);
    const conflicts: ReasoningConflict[] = ruleOutput.conflicts;
    const conflictingIds = new Set(conflicts.flatMap(c => c.evidenceIds));

    // ── Step 3: Confidence adjustments (policy-driven) ────────────────────────
    const adjustments = ConfidenceAdjuster.adjust(evidence, relationshipMap, conflictingIds, policy);

    // ── Step 4: Duplicate Merge (not silent discard) ──────────────────────────
    const { merged: mergedIds, mergeRecords } = mergeDuplicates(evidence, relationshipMap, adjustments);

    // ── Step 5: Assign roles + corroboration ─────────────────────────────────
    const reasoning: ReasoningEvidence[] = evidence.map(ev => {
      const adj          = adjustments.get(ev.memoryId) ?? ev.confidence;
      const rels         = relationshipMap.get(ev.memoryId) ?? [];
      const corroboration = computeCorroboration(ev, evidence, relationshipMap, totalProviders);

      let role: EvidenceRole  = "primary";
      let discardReason: string | null = null;

      if (mergedIds.has(ev.memoryId)) {
        role = "discarded";
        discardReason = "Duplicate merged into higher-confidence version (content preserved in mergeRecords)";
      } else if (conflictingIds.has(ev.memoryId)) {
        const c = conflicts.find(cf => cf.evidenceIds.includes(ev.memoryId));
        role = (c?.winner && c.winner !== ev.memoryId) ? "conflicting" : (c?.winner ? "primary" : "conflicting");
      } else if (rels.some(r => r.type === "complements")) {
        role = "supporting";
      }

      return {
        original:       ev,
        role,
        adjustedConf:   adj,
        discardReason,
        relationships:  rels,
        corroboration,
      };
    });

    // ── Step 6: Hypotheses ────────────────────────────────────────────────────
    const activeEvidence = evidence.filter(e => !mergedIds.has(e.memoryId));
    const hypotheses     = HypothesisGenerator.generate(activeEvidence, query);

    // ── Step 7: Overall confidence ────────────────────────────────────────────
    const hasUnresolved  = conflicts.some(c => c.resolution === "unresolved");
    const overallConf    = ConfidenceAdjuster.overall(activeEvidence, adjustments, hasUnresolved, policy);

    // ── Step 8: Explanation + Consolidated + Structured + Context ─────────────
    const explanation    = ExplanationBuilder.buildExplanation(session, reasoning, conflicts, hypotheses, ruleOutput.appliedRuleIds);
    const consolidated   = ExplanationBuilder.buildConsolidated(query, reasoning, conflicts, hypotheses, overallConf);
    const structuredContext = ExplanationBuilder.buildStructuredContext(reasoning, conflicts, hypotheses, consolidated, mergeRecords);
    const context        = ExplanationBuilder.buildContextBlock(query, consolidated, conflicts, hypotheses, explanation);

    const finalSession: ReasoningSession = { ...session, durationMs: Date.now() - t0 };

    return Object.freeze({
      session:           finalSession,
      consolidated,
      reasoning,
      conflicts,
      hypotheses,
      explanation,
      confidence:        overallConf,
      context,
      structuredContext,
      merges:            mergeRecords,
    });
  },

  /** Convenience: UCME query + reasoning in one call for the Planner. */
  async queryAndReason(
    query: string,
    ucmeQuery: import("@/lib/ucme/UCMETypes").MemoryQuery,
  ): Promise<ReasoningResult> {
    const { UnifiedMemoryEngine } = await import("@/lib/ucme/UnifiedMemoryEngine");
    const result = await UnifiedMemoryEngine.query(ucmeQuery);
    return MemoryReasoningEngine.reason(query, result.evidence);
  },
};