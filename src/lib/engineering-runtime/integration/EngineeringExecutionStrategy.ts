/**
 * EngineeringExecutionStrategy.ts
 * Selects validation, review, testing, rollback, merge and deployment
 * strategies from knowledge signals.
 *
 * SRP: Strategy selection only.
 * Sprint: INTEGRATION-05
 */

import type { EngineeringKnowledgeContext }  from "./EngineeringKnowledgeContext";
import type { EngineeringRiskReport }        from "./EngineeringRiskAnalyzer";
import type { EngineeringConstraints }       from "./EngineeringExecutionConstraints";
import type { EngineeringConfidence }        from "./EngineeringConfidenceCalculator";

export type ValidationStrategy  = "NONE" | "STATIC_ANALYSIS" | "FULL_VALIDATION" | "ARCHITECTURAL_AUDIT";
export type ReviewStrategy      = "SELF_REVIEW" | "PEER_REVIEW" | "LEAD_REVIEW" | "COMMITTEE_REVIEW";
export type TestingStrategy     = "UNIT_ONLY" | "UNIT_INTEGRATION" | "FULL_SUITE" | "REGRESSION_FOCUSED";
export type RollbackStrategy    = "NONE" | "GIT_REVERT" | "FEATURE_FLAG" | "BLUE_GREEN";
export type MergeStrategy       = "DIRECT" | "SQUASH" | "REBASE" | "MERGE_COMMIT";
export type DeploymentReadiness = "READY" | "NEEDS_REVIEW" | "BLOCKED" | "DEFERRED";

export interface EngineeringExecutionPlan {
  readonly taskId:              string;
  readonly validationStrategy:  ValidationStrategy;
  readonly reviewStrategy:      ReviewStrategy;
  readonly testingStrategy:     TestingStrategy;
  readonly rollbackStrategy:    RollbackStrategy;
  readonly mergeStrategy:       MergeStrategy;
  readonly deploymentReadiness: DeploymentReadiness;
}

export const EngineeringExecutionStrategy = Object.freeze({

  select(
    ctx:         EngineeringKnowledgeContext,
    risk:        EngineeringRiskReport,
    constraints: EngineeringConstraints,
    confidence:  EngineeringConfidence,
  ): EngineeringExecutionPlan {
    const highRisk     = risk.overallLevel === "CRITICAL" || risk.overallLevel === "HIGH";
    const criticalPrio = ctx.priority === "CRITICAL";

    const validationStrategy: ValidationStrategy =
      risk.overallLevel === "CRITICAL" ? "ARCHITECTURAL_AUDIT"
      : highRisk                       ? "FULL_VALIDATION"
      : confidence.level === "VERY_HIGH" ? "STATIC_ANALYSIS"
      : "FULL_VALIDATION";

    const reviewStrategy: ReviewStrategy =
      criticalPrio || risk.overallLevel === "CRITICAL" ? "COMMITTEE_REVIEW"
      : highRisk                                       ? "LEAD_REVIEW"
      : confidence.level === "VERY_HIGH"               ? "SELF_REVIEW"
      : "PEER_REVIEW";

    const testingStrategy: TestingStrategy =
      risk.regressionRisk                              ? "REGRESSION_FOCUSED"
      : risk.breakingChangeRisk || criticalPrio        ? "FULL_SUITE"
      : ctx.task === "REFACTOR"                        ? "UNIT_INTEGRATION"
      : "UNIT_ONLY";

    const rollbackStrategy: RollbackStrategy =
      !constraints.requiresRollbackPlan                ? "NONE"
      : ctx.task === "DEPLOY"                          ? "BLUE_GREEN"
      : risk.breakingChangeRisk                        ? "FEATURE_FLAG"
      : "GIT_REVERT";

    const mergeStrategy: MergeStrategy =
      criticalPrio                                     ? "MERGE_COMMIT"
      : highRisk                                       ? "SQUASH"
      : ctx.task === "REFACTOR"                        ? "REBASE"
      : "SQUASH";

    const deploymentReadiness: DeploymentReadiness =
      risk.overallLevel === "CRITICAL" || govBlock(constraints) ? "BLOCKED"
      : constraints.requiresApproval                           ? "NEEDS_REVIEW"
      : confidence.level === "INSUFFICIENT"                    ? "DEFERRED"
      : "READY";

    return Object.freeze({
      taskId: ctx.taskId,
      validationStrategy, reviewStrategy, testingStrategy,
      rollbackStrategy, mergeStrategy, deploymentReadiness,
    });
  },
});

function govBlock(c: EngineeringConstraints): boolean {
  return c.requiresApproval && c.mandatoryReviews.length > 1;
}