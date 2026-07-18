/**
 * GovernancePolicyPipeline.ts
 * Orchestrates the full Governance Policy pipeline.
 *
 * Authority: ENGINEERING
 * SRP: Pipeline orchestration only.
 * Sprint: KB-05
 *
 * Flow: KnowledgeReview → GovernanceEvaluationContext → Decision → Audit → Metrics
 */

import { GovernanceDecisionEngine }  from "./GovernanceDecisionEngine";
import { GovernancePolicyAudit }     from "./GovernancePolicyAudit";
import { GovernancePolicyMetricsEngine } from "./GovernancePolicyMetrics";
import type {
  GovernanceEvaluationContext, GovernanceResult, GovernancePolicyMetrics,
} from "./GovernancePolicyTypes";

export interface GovernancePipelineResult {
  readonly context:    GovernanceEvaluationContext;
  readonly result:     GovernanceResult;
  readonly durationMs: number;
  readonly success:    boolean;
}

export const GovernancePolicyPipeline = Object.freeze({

  /**
   * Run the full pipeline for one evaluation context.
   */
  run(ctx: GovernanceEvaluationContext): GovernancePipelineResult {
    const start = Date.now();

    // 1. Decide
    const result = GovernanceDecisionEngine.decide(ctx);

    // 2. Audit
    GovernancePolicyAudit.log(result);

    return {
      context:    ctx,
      result,
      durationMs: Date.now() - start,
      success:    true,
    };
  },

  /**
   * Run the pipeline for multiple contexts.
   */
  runBatch(contexts: GovernanceEvaluationContext[]): GovernancePipelineResult[] {
    return contexts.map(ctx => GovernancePolicyPipeline.run(ctx));
  },

  /**
   * Build an evaluation context from a KnowledgeReview-like object.
   * Allows integration without tight coupling to KnowledgeReviewTypes.
   */
  buildContext(params: {
    captureId:      string;
    reviewId:       string;
    evidenceScore:  number;
    confidence:     number;
    regressionCount?:number;
    occurrences?:   number;
    approvalCount?: number;
    duplicatesCount?:number;
    category?:      string;
    type?:          string;
    sourceType?:    string;
    priority?:      string;
    sprint?:        string;
    components?:    string[];
    isAntiPattern?: boolean;
    isBestPractice?:boolean;
    isKnownIssue?:  boolean;
    isLesson?:      boolean;
    status?:        string;
    approvalLevel?: string;
  }): GovernanceEvaluationContext {
    return {
      captureId:       params.captureId,
      reviewId:        params.reviewId,
      evidenceScore:   params.evidenceScore,
      confidence:      params.confidence,
      regressionCount: params.regressionCount  ?? 0,
      occurrences:     params.occurrences       ?? 1,
      approvalCount:   params.approvalCount     ?? 0,
      duplicatesCount: params.duplicatesCount   ?? 0,
      category:        params.category          ?? "UNKNOWN",
      type:            params.type              ?? "OBSERVATION",
      sourceType:      params.sourceType        ?? "MANUAL_FORM",
      priority:        params.priority          ?? "MEDIUM",
      sprint:          params.sprint            ?? "",
      components:      params.components        ?? [],
      isAntiPattern:   params.isAntiPattern     ?? false,
      isBestPractice:  params.isBestPractice    ?? false,
      isKnownIssue:    params.isKnownIssue      ?? false,
      isLesson:        params.isLesson          ?? true,
      status:          params.status            ?? "PENDING",
      approvalLevel:   params.approvalLevel     ?? "ENGINEERING",
    };
  },

  getMetrics(): GovernancePolicyMetrics {
    return GovernancePolicyMetricsEngine.generate();
  },
});