/**
 * EngineeringKnowledgePipeline.ts
 * Orchestrates the full Engineering Knowledge pipeline.
 *
 * SRP: Orchestration only.
 * Sprint: INTEGRATION-05
 *
 * Flow:
 *   Request → Context → Provider → RiskAnalyzer → GovernanceValidator
 *   → ExecutionConstraints → ConfidenceCalculator → ExecutionStrategy
 *   → KnowledgeAdvisor → ExecutionReport → Audit
 *
 * The Engineering Runtime receives the EngineeringAdvisory and remains fully decoupled.
 */

import { EngineeringKnowledgeContextBuilder } from "./EngineeringKnowledgeContext";
import { EngineeringKnowledgeProvider }        from "./EngineeringKnowledgeProvider";
import { EngineeringRiskAnalyzer }             from "./EngineeringRiskAnalyzer";
import { EngineeringGovernanceValidator }      from "./EngineeringGovernanceValidator";
import { EngineeringExecutionConstraints }     from "./EngineeringExecutionConstraints";
import { EngineeringConfidenceCalculator }     from "./EngineeringConfidenceCalculator";
import { EngineeringExecutionStrategy }        from "./EngineeringExecutionStrategy";
import { EngineeringKnowledgeAdvisor }         from "./EngineeringKnowledgeAdvisor";
import { EngineeringExecutionReportBuilder }   from "./EngineeringExecutionReport";
import { EngineeringKnowledgeAudit }           from "./EngineeringKnowledgeAudit";
import { EngineeringKnowledgeMetrics }         from "./EngineeringKnowledgeMetrics";
import type { EngineeringTaskRequest, EngineeringKnowledgeContext } from "./EngineeringKnowledgeContext";
import type { EngineeringKnowledgeBundle }     from "./EngineeringKnowledgeProvider";
import type { EngineeringRiskReport }          from "./EngineeringRiskAnalyzer";
import type { EngineeringGovernanceResult }    from "./EngineeringGovernanceValidator";
import type { EngineeringConstraints }         from "./EngineeringExecutionConstraints";
import type { EngineeringConfidence }          from "./EngineeringConfidenceCalculator";
import type { EngineeringExecutionPlan }       from "./EngineeringExecutionStrategy";
import type { EngineeringAdvisory }            from "./EngineeringKnowledgeAdvisor";
import type { EngineeringExecutionReport }     from "./EngineeringExecutionReport";

export interface EngineeringKnowledgePipelineResult {
  readonly ctx:         EngineeringKnowledgeContext;
  readonly bundle:      EngineeringKnowledgeBundle;
  readonly risk:        EngineeringRiskReport;
  readonly governance:  EngineeringGovernanceResult;
  readonly constraints: EngineeringConstraints;
  readonly confidence:  EngineeringConfidence;
  readonly plan:        EngineeringExecutionPlan;
  readonly advisory:    EngineeringAdvisory;
  readonly report:      EngineeringExecutionReport;
  readonly durationMs:  number;
}

export const EngineeringKnowledgePipeline = Object.freeze({

  run(req: EngineeringTaskRequest): EngineeringKnowledgePipelineResult {
    const start = Date.now();

    const ctx         = EngineeringKnowledgeContextBuilder.build(req);
    const bundle      = EngineeringKnowledgeProvider.fetch(ctx);
    const risk        = EngineeringRiskAnalyzer.analyze(ctx, bundle.knownIssues, bundle.antiPatterns, bundle.governance);
    const governance  = EngineeringGovernanceValidator.validate(ctx, bundle.governance);
    const constraints = EngineeringExecutionConstraints.build(ctx, risk, bundle.governance);
    const supporting  = [...bundle.lessons, ...bundle.bestPractices, ...bundle.governance];
    const confidence  = EngineeringConfidenceCalculator.calculate(supporting, governance, risk);
    const plan        = EngineeringExecutionStrategy.select(ctx, risk, constraints, confidence);
    const advisory    = EngineeringKnowledgeAdvisor.advise(ctx, bundle, risk, governance, constraints, plan, confidence);
    const durationMs  = Date.now() - start;
    const report      = EngineeringExecutionReportBuilder.build(ctx, advisory, plan, risk, durationMs);

    EngineeringKnowledgeAudit.log({
      taskId:           ctx.taskId,
      task:             ctx.task,
      module:           ctx.module,
      timestamp:        new Date().toISOString(),
      knowledgeUsed:    bundle.all.map(i => i.id),
      governanceUsed:   bundle.governance.map(g => g.id),
      risksFound:       risk.risks.length,
      blockers:         risk.blockers.length,
      mandatoryReviews: constraints.mandatoryReviews.length,
      requiredTests:    constraints.requiredTests.length,
      confidence:       confidence.score,
      strategy:         plan.validationStrategy,
      result:           report.result,
      durationMs,
    });

    return Object.freeze({ ctx, bundle, risk, governance, constraints, confidence, plan, advisory, report, durationMs });
  },

  getMetrics() {
    return EngineeringKnowledgeMetrics.snapshot();
  },
});