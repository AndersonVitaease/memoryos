/**
 * LearningReport.ts — Sprint EF-51
 *
 * SRP: montar o LearningReport final a partir de todos os outputs do pipeline.
 */

import type {
  LearningReport, LearningMetrics, CandidatePattern, KnowledgeRule,
  AntiPattern, CapabilityLearningRecord, StrategyLearningRecord, KnowledgeGraph,
} from "./CLTypes";
import { makeCLId } from "./CLTypes";

export class LearningReportBuilder {
  build(opts: {
    startedAt: number;
    episodesAnalyzed: number;
    patterns: readonly CandidatePattern[];
    approvedPatterns: readonly CandidatePattern[];
    rejectedPatterns: readonly CandidatePattern[];
    promotedRules: readonly KnowledgeRule[];
    updatedRules: readonly KnowledgeRule[];
    deprecatedRules: readonly KnowledgeRule[];
    antiPatterns: readonly AntiPattern[];
    capabilityReinforcements: readonly CapabilityLearningRecord[];
    strategyReinforcements: readonly StrategyLearningRecord[];
    knowledgeGraph: KnowledgeGraph;
    metrics: LearningMetrics;
  }): LearningReport {
    const {
      startedAt, episodesAnalyzed, patterns, approvedPatterns, rejectedPatterns,
      promotedRules, updatedRules, deprecatedRules, antiPatterns,
      capabilityReinforcements, strategyReinforcements, knowledgeGraph, metrics,
    } = opts;

    const durationMs = Date.now() - startedAt;

    const suggestions: string[] = [];
    if (metrics.patternsRejected > metrics.patternsApproved) {
      suggestions.push("Consider lowering policy thresholds — many patterns are being rejected.");
    }
    if (antiPatterns.filter(a => a.severity === "critical").length > 0) {
      suggestions.push("Critical anti-patterns detected. Review strategy configuration.");
    }
    if (metrics.patternCoverage < 0.3) {
      suggestions.push("Pattern coverage is low. Collect more diverse episodes.");
    }
    if (metrics.knowledgeAccuracy < 0.6) {
      suggestions.push("Knowledge accuracy is below 60%. Validate rules with domain experts.");
    }
    if (capabilityReinforcements.filter(c => c.successRate < 0.5).length > 0) {
      suggestions.push("Some capabilities have low success rates. Consider reviewing their usage.");
    }

    const topPatterns = [...patterns].sort((a, b) => b.frequency - a.frequency).slice(0, 5);

    const summary = [
      `EF-51 Learning Engine — ${episodesAnalyzed} episodes analyzed`,
      `${patterns.length} patterns found, ${approvedPatterns.length} approved, ${rejectedPatterns.length} rejected`,
      `${promotedRules.length} knowledge rules promoted`,
      `${antiPatterns.length} anti-patterns detected`,
      `Optimization gain: ${(metrics.optimizationGain * 100).toFixed(1)}%`,
    ].join(" · ");

    return Object.freeze({
      id:                       makeCLId("lr"),
      generatedAt:              Date.now(),
      durationMs,
      episodesAnalyzed,
      patternsFound:            patterns.length,
      patternsApproved:         approvedPatterns.length,
      patternsRejected:         rejectedPatterns.length,
      knowledgeCreated:         promotedRules.length,
      knowledgeUpdated:         updatedRules.length,
      knowledgeDeprecated:      deprecatedRules.length,
      metrics,
      optimizationSuggestions:  Object.freeze(suggestions),
      topPatterns:              Object.freeze(topPatterns),
      promotedRules:            Object.freeze(promotedRules),
      antiPatternsDetected:     Object.freeze(antiPatterns),
      capabilityReinforcements: Object.freeze(capabilityReinforcements),
      strategyReinforcements:   Object.freeze(strategyReinforcements),
      knowledgeGraph,
      summary,
    });
  }
}