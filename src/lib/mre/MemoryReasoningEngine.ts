/**
 * MemoryReasoningEngine.ts — MRE v1.0
 * Sprint 7.1.0
 *
 * Receives MemoryEvidence[] from the UCME and produces ReasoningResult.
 * This is where raw evidence becomes consolidated knowledge.
 *
 * Pipeline:
 *   MemoryEvidence[]
 *     → EvidenceAnalyzer    (relationships, duplicates)
 *     → ConflictResolver    (detect + resolve conflicts)
 *     → ConfidenceAdjuster  (multi-source adjustment)
 *     → HypothesisGenerator (when evidence is insufficient)
 *     → ExplanationBuilder  (consolidation + context)
 *     → ReasoningResult
 *
 * Invariants:
 *   ✓ Does NOT call any MemoryProvider
 *   ✓ Does NOT invent facts
 *   ✓ Does NOT silently discard evidence
 *   ✓ Every discard is justified
 *   ✓ Every conflict is preserved and explained
 */

import type { MemoryEvidence } from "@/lib/ucme/UCMETypes";
import type {
  ReasoningSession,
  ReasoningResult,
  ReasoningEvidence,
  ReasoningConflict,
  EvidenceRole,
} from "./MRETypes";
import { EvidenceAnalyzer }   from "./EvidenceAnalyzer";
import { ConflictResolver }    from "./ConflictResolver";
import { HypothesisGenerator } from "./HypothesisGenerator";
import { ConfidenceAdjuster }  from "./ConfidenceAdjuster";
import { ExplanationBuilder }  from "./ExplanationBuilder";

let _seq = 1;
function sid() { return `session-${Date.now()}-${_seq++}`; }

// ── Built-in rules (ids only — logic is inline for clarity) ──────────────────

const RULES_APPLIED = ["R-ANALYZE", "R-CONFLICT", "R-ADJUST-CONF", "R-HYPOTHESIS", "R-EXPLAIN"];

export const MemoryReasoningEngine = {

  /**
   * Main entry point.
   * Planners call this after UnifiedMemoryEngine.query().
   * Never call specific providers here.
   */
  reason(query: string, evidence: MemoryEvidence[]): ReasoningResult {
    const t0 = Date.now();
    const session: ReasoningSession = {
      id:         sid(),
      query,
      startedAt:  new Date().toISOString(),
      evidence,
      durationMs: 0,
    };

    // ── Step 1: Analyze relationships ─────────────────────────────────────────
    const relationshipMap = EvidenceAnalyzer.analyzeRelationships(evidence);

    // ── Step 2: Detect and resolve conflicts ──────────────────────────────────
    const rawConflicts    = EvidenceAnalyzer.detectConflicts(evidence);
    const conflicts: ReasoningConflict[] = rawConflicts.map(({ a, b, sim }) =>
      ConflictResolver.resolve(
        a, b,
        `"${a.providerName}" and "${b.providerName}" provide different information about the same topic (similarity: ${(sim * 100).toFixed(0)}%)`
      )
    );
    const conflictingIds = new Set(conflicts.flatMap(c => c.evidenceIds));

    // ── Step 3: Adjust confidence ─────────────────────────────────────────────
    const adjustments = ConfidenceAdjuster.adjust(evidence, relationshipMap, conflictingIds);

    // ── Step 4: Build ReasoningEvidence with roles ────────────────────────────
    const discardedIds = new Set<string>();

    // Discard duplicates: keep the one with higher adjusted confidence
    for (const ev of evidence) {
      const rels = relationshipMap.get(ev.memoryId) ?? [];
      for (const rel of rels.filter(r => r.type === "duplicates")) {
        const myConf    = adjustments.get(ev.memoryId)   ?? ev.confidence;
        const otherConf = adjustments.get(rel.targetId)   ?? 0;
        // Keep higher confidence; discard lower (don't double-discard)
        if (myConf < otherConf && !discardedIds.has(rel.targetId)) {
          discardedIds.add(ev.memoryId);
        }
      }
    }

    // Assign roles
    const reasoning: ReasoningEvidence[] = evidence.map(ev => {
      const adj  = adjustments.get(ev.memoryId) ?? ev.confidence;
      const rels = relationshipMap.get(ev.memoryId) ?? [];

      let role: EvidenceRole = "primary";
      let discardReason: string | null = null;

      if (discardedIds.has(ev.memoryId)) {
        role = "discarded";
        discardReason = "Duplicate content — higher-confidence version retained";
      } else if (conflictingIds.has(ev.memoryId)) {
        const c = conflicts.find(cf => cf.evidenceIds.includes(ev.memoryId));
        if (c?.winner && c.winner !== ev.memoryId) {
          role = "conflicting";
        } else if (!c?.winner) {
          role = "conflicting"; // unresolved — keep but mark
        } else {
          role = "primary"; // this is the winner
        }
      } else if (rels.some(r => r.type === "complements")) {
        role = "supporting";
      }

      return {
        original:       ev,
        role,
        adjustedConf:   adj,
        discardReason,
        relationships:  rels,
      };
    });

    // ── Step 5: Hypotheses when evidence is insufficient ──────────────────────
    const activeEvidence = evidence.filter(e => !discardedIds.has(e.memoryId));
    const hypotheses     = HypothesisGenerator.generate(activeEvidence, query);

    // ── Step 6: Overall confidence ────────────────────────────────────────────
    const hasUnresolved = conflicts.some(c => c.resolution === "unresolved");
    const overallConf   = ConfidenceAdjuster.overall(activeEvidence, adjustments, hasUnresolved);

    // ── Step 7: Explanation + Consolidated knowledge ──────────────────────────
    const explanation  = ExplanationBuilder.buildExplanation(session, reasoning, conflicts, hypotheses, RULES_APPLIED);
    const consolidated = ExplanationBuilder.buildConsolidated(query, reasoning, conflicts, hypotheses, overallConf);
    const context      = ExplanationBuilder.buildContextBlock(query, consolidated, conflicts, hypotheses, explanation);

    const finalSession: ReasoningSession = { ...session, durationMs: Date.now() - t0 };

    return Object.freeze({
      session:      finalSession,
      consolidated,
      reasoning,
      conflicts,
      hypotheses,
      explanation,
      confidence:   overallConf,
      context,
    });
  },

  /**
   * Convenience: query UCME then reason in one call.
   * This is what the Planner should use.
   */
  async queryAndReason(
    query: string,
    ucmeQuery: import("@/lib/ucme/UCMETypes").MemoryQuery,
  ): Promise<ReasoningResult> {
    const { UnifiedMemoryEngine } = await import("@/lib/ucme/UnifiedMemoryEngine");
    const result = await UnifiedMemoryEngine.query(ucmeQuery);
    return MemoryReasoningEngine.reason(query, result.evidence);
  },
};