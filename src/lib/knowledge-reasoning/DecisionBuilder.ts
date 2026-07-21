/**
 * DecisionBuilder.ts — Sprint EF-52
 *
 * SRP: produzir uma ReasoningDecision explicável e auditável
 *      a partir do InferenceChain e dos ConflictResolutions.
 *
 * Toda decisão é TEMPORÁRIA (isTemporary: true).
 * Toda decisão é explicável via ExplainabilityReport.
 * Toda decisão é reproduzível (mesmas entradas → mesma saída).
 */

import type {
  RetrievedRule, InferenceChain, Conflict, ConflictResolution,
  ReasoningDecision, DiscardedAlternative, ExplainabilityReport,
  ReasoningContext,
} from "./KRTypes";
import { makeKRId } from "./KRTypes";

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

export class DecisionBuilder {
  build(opts: {
    ctx:             ReasoningContext;
    rules:           readonly RetrievedRule[];
    chain:           InferenceChain;
    conflicts:       readonly Conflict[];
    resolutions:     readonly ConflictResolution[];
    loserIds:        Set<string>;
  }): ReasoningDecision {
    const { ctx, rules, chain, conflicts, resolutions, loserIds } = opts;

    // Winner rules: retrieved, not loser, sorted by relevance * confidence
    const winnerRules = rules
      .filter(r => !loserIds.has(r.ruleId))
      .sort((a, b) => (b.relevanceScore * b.confidence) - (a.relevanceScore * a.confidence));

    const usedRuleIds = winnerRules.slice(0, 5).map(r => r.ruleId);

    // Discarded alternatives: loser rules or low-relevance rules
    const discarded: DiscardedAlternative[] = [
      ...rules.filter(r => loserIds.has(r.ruleId)).map(r => ({
        ruleId:        r.ruleId,
        title:         r.title,
        discardReason: resolutions.find(res => res.loserId === r.ruleId)?.rationale ?? "Lost conflict resolution",
        score:         r.relevanceScore * r.confidence,
      })),
      ...rules
        .filter(r => !loserIds.has(r.ruleId) && r.relevanceScore < 0.2)
        .slice(0, 3)
        .map(r => ({
          ruleId:        r.ruleId,
          title:         r.title,
          discardReason: `Low relevance score (${(r.relevanceScore * 100).toFixed(1)}%)`,
          score:         r.relevanceScore * r.confidence,
        })),
    ];

    const confidence = chain.overallConfidence > 0
      ? chain.overallConfidence
      : avg(winnerRules.slice(0, 3).map(r => r.confidence));

    const authority = chain.overallAuthority > 0
      ? chain.overallAuthority
      : avg(winnerRules.slice(0, 3).map(r => r.authority));

    // Build justification
    const topConsequences = winnerRules
      .flatMap(r => r.consequences)
      .slice(0, 3)
      .map(c => c.explanation);

    const justification = topConsequences.length > 0
      ? topConsequences.join(" | ")
      : chain.finalConclusion;

    // Explainability
    const explainability: ExplainabilityReport = Object.freeze({
      conclusion:     chain.finalConclusion,
      justification,
      rulesApplied:   Object.freeze(winnerRules.slice(0, 5).map(r => ({
        ruleId:       r.ruleId,
        title:        r.title,
        contribution: r.relevanceScore,
      }))),
      inferenceTrace: Object.freeze(chain.steps.map(s => `[${s.type}] ${s.conclusion}`)),
      confidence,
      authority,
    });

    return Object.freeze({
      id:                    makeKRId("decision"),
      createdAt:             Date.now(),
      goal:                  ctx.goal,
      conclusion:            chain.finalConclusion,
      justification,
      inferenceChain:        chain,
      rulesUsed:             Object.freeze(usedRuleIds),
      confidence,
      authority,
      conflicts:             conflicts,
      conflictResolutions:   resolutions,
      discardedAlternatives: Object.freeze(discarded),
      isTemporary:           true as const,
      explainability,
    });
  }
}