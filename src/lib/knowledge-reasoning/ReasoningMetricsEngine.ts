/**
 * ReasoningMetricsEngine.ts — Sprint EF-52
 *
 * SRP: calcular ReasoningMetrics a partir dos outputs do pipeline.
 */

import type {
  ReasoningMetrics, RetrievedRule, InferenceChain,
  Conflict, ConflictResolution, ReasoningDecision,
} from "./KRTypes";

export class ReasoningMetricsEngine {
  compute(opts: {
    allRules:      readonly RetrievedRule[];
    usedRuleIds:   readonly string[];
    chain:         InferenceChain;
    conflicts:     readonly Conflict[];
    resolutions:   readonly ConflictResolution[];
    decision:      ReasoningDecision;
    durationMs:    number;
  }): ReasoningMetrics {
    const { allRules, usedRuleIds, chain, conflicts, resolutions, decision, durationMs } = opts;

    const conflictResolutionTimeMs = resolutions.reduce((s, r) => s + r.durationMs, 0);

    // Accuracy estimate: average confidence of used rules weighted by relevance
    const usedRules = allRules.filter(r => usedRuleIds.includes(r.ruleId));
    const reasoningAccuracy = usedRules.length > 0
      ? usedRules.reduce((s, r) => s + r.confidence * r.relevanceScore, 0) / usedRules.length
      : 0;

    return Object.freeze({
      knowledgeRetrieved:       allRules.length,
      knowledgeMatched:         usedRuleIds.length,
      inferenceCount:           chain.steps.length,
      inferenceDepth:           chain.depth,
      conflictCount:            conflicts.length,
      conflictResolutionTimeMs,
      decisionConfidence:       decision.confidence,
      decisionAuthority:        decision.authority,
      avgReasoningTimeMs:       durationMs,
      reasoningAccuracy,
    });
  }
}