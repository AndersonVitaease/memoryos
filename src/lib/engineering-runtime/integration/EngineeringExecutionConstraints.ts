/**
 * EngineeringExecutionConstraints.ts
 * Derives hard engineering constraints from governance + risk knowledge.
 *
 * SRP: Constraint construction only.
 * Sprint: INTEGRATION-05
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { EngineeringKnowledgeContext } from "./EngineeringKnowledgeContext";
import type { EngineeringRiskReport }       from "./EngineeringRiskAnalyzer";

export interface EngineeringConstraints {
  readonly taskId:               string;
  readonly mandatoryReviews:     string[];
  readonly requiredTests:        string[];
  readonly requiredDocumentation:string[];
  readonly blockedModules:       string[];
  readonly dependencyConstraints:string[];
  readonly securityConstraints:  string[];
  readonly requiresApproval:     boolean;
  readonly requiresRollbackPlan: boolean;
}

export const EngineeringExecutionConstraints = Object.freeze({

  build(
    ctx:        EngineeringKnowledgeContext,
    risk:       EngineeringRiskReport,
    governance: KnowledgeResultItem[],
  ): EngineeringConstraints {
    const highRisk     = risk.overallLevel === "CRITICAL" || risk.overallLevel === "HIGH";
    const criticalPrio = ctx.priority === "CRITICAL";

    const mandatoryReviews: string[] = [];
    if (highRisk || criticalPrio)        mandatoryReviews.push("Engineering Lead Review");
    if (risk.breakingChangeRisk)         mandatoryReviews.push("Architecture Review");
    if (risk.regressionRisk)             mandatoryReviews.push("QA Review");
    if (ctx.task === "DEPLOY")           mandatoryReviews.push("Release Review");

    const requiredTests: string[] = [];
    if (risk.regressionRisk)             requiredTests.push("Regression Suite");
    if (risk.breakingChangeRisk)         requiredTests.push("Integration Tests");
    if (criticalPrio)                    requiredTests.push("Full E2E Suite");
    if (ctx.task === "REFACTOR")         requiredTests.push("Unit Tests");

    const requiredDocumentation: string[] = [];
    if (risk.breakingChangeRisk)         requiredDocumentation.push("Migration Guide");
    if (ctx.task === "DEPRECATE")        requiredDocumentation.push("Deprecation Notice");
    if (criticalPrio)                    requiredDocumentation.push("Architecture Decision Record");

    const blockedModules = governance
      .filter(g => (g.title + g.summary).toLowerCase().includes("blocked"))
      .map(g => g.source);

    const dependencyConstraints = risk.risks
      .filter(r => r.category === "DEPENDENCY")
      .map(r => r.title);

    const securityConstraints = governance
      .filter(g => (g.title + g.summary).toLowerCase().includes("security"))
      .map(g => g.title);

    return Object.freeze({
      taskId:                ctx.taskId,
      mandatoryReviews,
      requiredTests,
      requiredDocumentation,
      blockedModules,
      dependencyConstraints,
      securityConstraints,
      requiresApproval:      criticalPrio || risk.blockers.length > 0,
      requiresRollbackPlan:  risk.breakingChangeRisk || ctx.task === "DEPLOY" || ctx.task === "MIGRATION",
    });
  },
});