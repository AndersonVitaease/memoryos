/**
 * EngineeringExecutionReport.ts
 * Immutable record of a completed engineering knowledge pipeline run.
 *
 * SRP: Report construction only.
 * Sprint: INTEGRATION-05
 */

import type { EngineeringKnowledgeContext }  from "./EngineeringKnowledgeContext";
import type { EngineeringAdvisory }          from "./EngineeringKnowledgeAdvisor";
import type { EngineeringExecutionPlan }     from "./EngineeringExecutionStrategy";
import type { EngineeringRiskReport }        from "./EngineeringRiskAnalyzer";

export type EngineeringResult = "APPROVED" | "BLOCKED" | "DEFERRED" | "NEEDS_REVIEW" | "COMPLETED";

export interface EngineeringExecutionReport {
  readonly reportId:          string;  // EER-NNN
  readonly taskId:            string;
  readonly module:            string;
  readonly component:         string;
  readonly filesModified:     number;
  readonly knowledgeUsed:     number;
  readonly governanceUsed:    number;
  readonly strategyUsed:      string;
  readonly reviewsRequired:   number;
  readonly testsRequired:     number;
  readonly result:            EngineeringResult;
  readonly riskLevel:         string;
  readonly confidence:        number;
  readonly durationMs:        number;
  readonly generatedAt:       string;
}

let _counter = 0;

export const EngineeringExecutionReportBuilder = Object.freeze({

  build(
    ctx:        EngineeringKnowledgeContext,
    advisory:   EngineeringAdvisory,
    plan:       EngineeringExecutionPlan,
    risk:       EngineeringRiskReport,
    durationMs: number,
  ): EngineeringExecutionReport {
    _counter++;

    const result: EngineeringResult =
      !advisory.proceed                                         ? "BLOCKED"
      : plan.deploymentReadiness === "NEEDS_REVIEW"            ? "NEEDS_REVIEW"
      : plan.deploymentReadiness === "DEFERRED"                ? "DEFERRED"
      : advisory.requiredReviews.length > 0                    ? "NEEDS_REVIEW"
      : "APPROVED";

    return Object.freeze({
      reportId:        `EER-${String(_counter).padStart(3, "0")}`,
      taskId:          ctx.taskId,
      module:          ctx.module,
      component:       ctx.component,
      filesModified:   ctx.files.length,
      knowledgeUsed:   advisory.lessonsApplied.length + advisory.bestPracticesApplied.length + advisory.governanceApplied.length,
      governanceUsed:  advisory.governanceApplied.length,
      strategyUsed:    plan.validationStrategy,
      reviewsRequired: advisory.requiredReviews.length,
      testsRequired:   advisory.requiredTests.length,
      result,
      riskLevel:       risk.overallLevel,
      confidence:      advisory.confidence.score,
      durationMs,
      generatedAt:     new Date().toISOString(),
    });
  },
});