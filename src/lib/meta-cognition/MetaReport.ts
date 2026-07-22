/**
 * MetaReport.ts — Sprint EF-54
 *
 * SRP: montar o MetaReport final — reproduzível e auditável.
 */

import type {
  MetaReport as IMetaReport, CognitiveFlow, DetectedBias, Alternative,
  EvidenceEvaluation, ConsistencyIssue, ConfidenceReview,
  ReasoningReview, Reflection, MetaMetrics,
} from "./MCTypes";
import { makeMCId } from "./MCTypes";

export class MetaReportBuilder {
  build(opts: {
    startedAt:        number;
    goal:             string;
    cognitiveFlow:    CognitiveFlow;
    biases:           readonly DetectedBias[];
    alternatives:     readonly Alternative[];
    evidenceEval:     EvidenceEvaluation;
    consistencyIssues: readonly ConsistencyIssue[];
    confidenceReview: ConfidenceReview;
    reasoningReview:  ReasoningReview;
    reflection:       Reflection;
    metrics:          MetaMetrics;
  }): IMetaReport {
    const { startedAt, goal, cognitiveFlow, biases, alternatives, evidenceEval, consistencyIssues, confidenceReview, reasoningReview, reflection, metrics } = opts;

    const criticalBiases   = biases.filter(b => b.severity === "critical").length;
    const criticalIssues   = consistencyIssues.filter(i => i.severity === "critical").length;

    const summary = [
      `EF-54 Meta-Cognitive Analysis — goal="${goal}"`,
      `flow_quality=${(cognitiveFlow.overallQuality * 100).toFixed(0)}%`,
      `biases=${biases.length}${criticalBiases > 0 ? ` (${criticalBiases} critical)` : ""}`,
      `consistency_issues=${consistencyIssues.length}${criticalIssues > 0 ? ` (${criticalIssues} critical)` : ""}`,
      `meta_confidence=${(metrics.metaConfidence * 100).toFixed(0)}%`,
    ].join(" · ");

    return Object.freeze({
      id:                 makeMCId("mr"),
      generatedAt:        Date.now(),
      durationMs:         Date.now() - startedAt,
      goal,
      cognitiveFlow,
      biases,
      alternatives,
      evidenceEvaluation: evidenceEval,
      consistencyIssues,
      confidenceReview,
      reasoningReview,
      reflection,
      metrics,
      summary,
    });
  }
}