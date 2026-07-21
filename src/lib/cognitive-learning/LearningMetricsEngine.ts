/**
 * LearningMetricsEngine.ts — Sprint EF-51
 *
 * SRP: calcular LearningMetrics a partir dos outputs do pipeline.
 */

import type {
  LearningMetrics, CandidatePattern, KnowledgeRule, ValidationResult,
} from "./CLTypes";

export class LearningMetricsEngine {
  compute(opts: {
    episodesProcessed: number;
    patterns: readonly CandidatePattern[];
    validationResults: readonly ValidationResult[];
    prevKnowledgeCount: number;
    currentKnowledgeCount: number;
    durationMs: number;
    promotedRules: readonly KnowledgeRule[];
  }): LearningMetrics {
    const {
      episodesProcessed, patterns, validationResults,
      prevKnowledgeCount, currentKnowledgeCount, durationMs, promotedRules,
    } = opts;

    const approved  = validationResults.filter(v => v.approved).length;
    const rejected  = validationResults.filter(v => !v.approved).length;

    const knowledgeAccuracy = promotedRules.length > 0
      ? promotedRules.reduce((s, r) => s + r.successRate, 0) / promotedRules.length : 0;

    const patternCoverage = episodesProcessed > 0
      ? Math.min(patterns.length / episodesProcessed, 1) : 0;

    const learningConfidence = promotedRules.length > 0
      ? promotedRules.reduce((s, r) => s + r.confidence, 0) / promotedRules.length : 0;

    const knowledgeGrowth = currentKnowledgeCount - prevKnowledgeCount;

    const optimizationGain = Math.min(
      (approved * 0.5 + knowledgeGrowth * 0.3 + knowledgeAccuracy * 0.2) / 10, 1,
    );

    return Object.freeze({
      episodesProcessed,
      patternsFound:       patterns.length,
      patternsApproved:    approved,
      patternsRejected:    rejected,
      knowledgeCreated:    knowledgeGrowth > 0 ? knowledgeGrowth : 0,
      knowledgeUpdated:    0,
      knowledgeDeprecated: 0,
      knowledgeAccuracy,
      patternCoverage,
      learningConfidence,
      knowledgeGrowth,
      avgLearningTimeMs:   episodesProcessed > 0 ? durationMs / episodesProcessed : durationMs,
      optimizationGain,
    });
  }
}