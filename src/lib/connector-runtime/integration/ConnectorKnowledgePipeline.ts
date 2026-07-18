/**
 * ConnectorKnowledgePipeline.ts
 * Orchestrates the full Connector Knowledge pipeline.
 *
 * SRP: Orchestration only.
 * Sprint: INTEGRATION-04
 *
 * Flow:
 *   Request → Context → Provider → RiskAnalyzer → GovernanceValidator
 *   → ExecutionConstraints → ConfidenceCalculator → ExecutionStrategy
 *   → ExecutionAdvisor → ExecutionReport → Audit
 *
 * The Connector Runtime receives the ConnectorExecutionAdvisory and remains fully decoupled.
 */

import { ConnectorKnowledgeContextBuilder } from "./ConnectorKnowledgeContext";
import { ConnectorKnowledgeProvider }        from "./ConnectorKnowledgeProvider";
import { ConnectorRiskAnalyzer }             from "./ConnectorRiskAnalyzer";
import { ConnectorGovernanceValidator }      from "./ConnectorGovernanceValidator";
import { ConnectorExecutionConstraints }     from "./ConnectorExecutionConstraints";
import { ConnectorConfidenceCalculator }     from "./ConnectorConfidenceCalculator";
import { ConnectorExecutionStrategy }        from "./ConnectorExecutionStrategy";
import { ConnectorExecutionAdvisor }         from "./ConnectorExecutionAdvisor";
import { ConnectorExecutionReportBuilder }   from "./ConnectorExecutionReport";
import { ConnectorKnowledgeAudit }           from "./ConnectorKnowledgeAudit";
import { ConnectorKnowledgeMetrics }         from "./ConnectorKnowledgeMetrics";
import type { ConnectorRequest, ConnectorKnowledgeContext } from "./ConnectorKnowledgeContext";
import type { ConnectorKnowledgeBundle }     from "./ConnectorKnowledgeProvider";
import type { ConnectorRiskReport }          from "./ConnectorRiskAnalyzer";
import type { ConnectorGovernanceResult }    from "./ConnectorGovernanceValidator";
import type { ExecutionConstraints }         from "./ConnectorExecutionConstraints";
import type { ConnectorExecutionConfidence } from "./ConnectorConfidenceCalculator";
import type { ConnectorExecutionPlan }       from "./ConnectorExecutionStrategy";
import type { ConnectorExecutionAdvisory }   from "./ConnectorExecutionAdvisor";
import type { ConnectorExecutionReport }     from "./ConnectorExecutionReport";

export interface ConnectorKnowledgePipelineResult {
  readonly ctx:         ConnectorKnowledgeContext;
  readonly bundle:      ConnectorKnowledgeBundle;
  readonly risk:        ConnectorRiskReport;
  readonly governance:  ConnectorGovernanceResult;
  readonly constraints: ExecutionConstraints;
  readonly confidence:  ConnectorExecutionConfidence;
  readonly plan:        ConnectorExecutionPlan;
  readonly advisory:    ConnectorExecutionAdvisory;
  readonly report:      ConnectorExecutionReport;
  readonly durationMs:  number;
}

export const ConnectorKnowledgePipeline = Object.freeze({

  run(req: ConnectorRequest): ConnectorKnowledgePipelineResult {
    const start = Date.now();

    // 1. Build context
    const ctx = ConnectorKnowledgeContextBuilder.build(req);

    // 2. Fetch knowledge (exclusively via KnowledgeQueryFacade)
    const bundle = ConnectorKnowledgeProvider.fetch(ctx);

    // 3. Risk analysis
    const risk = ConnectorRiskAnalyzer.analyze(ctx, bundle.knownIssues, bundle.antiPatterns, bundle.governance);

    // 4. Governance validation
    const governance = ConnectorGovernanceValidator.validate(ctx, bundle.governance);

    // 5. Execution constraints
    const constraints = ConnectorExecutionConstraints.build(ctx, risk, bundle.governance);

    // 6. Confidence calculation
    const supporting = [...bundle.lessons, ...bundle.bestPractices, ...bundle.governance];
    const confidence = ConnectorConfidenceCalculator.calculate(supporting, governance, risk, 0);

    // 7. Execution strategy
    const plan = ConnectorExecutionStrategy.select(ctx, risk, constraints, confidence);

    // 8. Advisor
    const advisory = ConnectorExecutionAdvisor.advise(ctx, bundle, risk, governance, plan, confidence);

    const durationMs = Date.now() - start;

    // 9. Execution report
    const report = ConnectorExecutionReportBuilder.build(ctx, advisory, plan, risk, durationMs);

    // 10. Audit
    ConnectorKnowledgeAudit.log({
      requestId:         ctx.requestId,
      connector:         ctx.connector,
      operation:         ctx.operation,
      timestamp:         new Date().toISOString(),
      knowledgeUsed:     bundle.all.map(i => i.id),
      knowledgeDiscarded:0,
      governanceUsed:    bundle.governance.map(g => g.id),
      risksFound:        risk.risks.length,
      blockers:          risk.blockers.length,
      constraintsTotal:  constraints.rateLimitedOps.length + (constraints.requiresReview ? 1 : 0),
      confidence:        confidence.score,
      retryStrategy:     plan.retryStrategy,
      fallbackStrategy:  plan.fallbackStrategy,
      result:            report.result,
      durationMs,
    });

    return Object.freeze({ ctx, bundle, risk, governance, constraints, confidence, plan, advisory, report, durationMs });
  },

  getMetrics() {
    return ConnectorKnowledgeMetrics.snapshot();
  },
});