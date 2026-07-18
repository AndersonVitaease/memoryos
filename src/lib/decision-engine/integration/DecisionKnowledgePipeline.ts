/**
 * DecisionKnowledgePipeline.ts
 * Orchestrates the full Decision Knowledge pipeline.
 *
 * SRP: Orchestration only.
 * Sprint: INTEGRATION-03
 *
 * Flow:
 *   Request → Context → Provider → RiskAnalyzer → ConstraintResolver
 *   → GovernanceValidator → ConfidenceCalculator → Advisor → Audit → Result
 *
 * The Decision Engine receives the DecisionAdvisory and remains fully decoupled.
 */

import { DecisionKnowledgeContextBuilder } from "./DecisionKnowledgeContext";
import { DecisionKnowledgeProvider }        from "./DecisionKnowledgeProvider";
import { DecisionRiskAnalyzer }             from "./DecisionRiskAnalyzer";
import { DecisionConstraintResolver }       from "./DecisionConstraintResolver";
import { DecisionGovernanceValidator }      from "./DecisionGovernanceValidator";
import { DecisionConfidenceCalculator }     from "./DecisionConfidenceCalculator";
import { DecisionKnowledgeAdvisor }         from "./DecisionKnowledgeAdvisor";
import { DecisionKnowledgeAudit }           from "./DecisionKnowledgeAudit";
import { DecisionKnowledgeMetrics }         from "./DecisionKnowledgeMetrics";
import type { DecisionRequest, DecisionKnowledgeContext } from "./DecisionKnowledgeContext";
import type { DecisionAdvisory }            from "./DecisionKnowledgeAdvisor";
import type { RiskReport }                  from "./DecisionRiskAnalyzer";
import type { ConstraintReport }            from "./DecisionConstraintResolver";
import type { GovernanceValidationResult }  from "./DecisionGovernanceValidator";
import type { DecisionConfidence }          from "./DecisionConfidenceCalculator";

export interface DecisionKnowledgePipelineResult {
  readonly ctx:         DecisionKnowledgeContext;
  readonly advisory:    DecisionAdvisory;
  readonly risk:        RiskReport;
  readonly constraints: ConstraintReport;
  readonly governance:  GovernanceValidationResult;
  readonly confidence:  DecisionConfidence;
  readonly durationMs:  number;
}

export const DecisionKnowledgePipeline = Object.freeze({

  run(req: DecisionRequest): DecisionKnowledgePipelineResult {
    const start = Date.now();

    // 1. Build context
    const ctx = DecisionKnowledgeContextBuilder.build(req);

    // 2. Fetch knowledge (exclusively via KnowledgeQueryFacade)
    const bundle = DecisionKnowledgeProvider.fetch(ctx);

    // 3. Risk analysis
    const risk = DecisionRiskAnalyzer.analyze(ctx, bundle.knownIssues, bundle.antiPatterns, bundle.governance);

    // 4. Constraint resolution
    const constraints = DecisionConstraintResolver.resolve(ctx, bundle.governance, bundle.knownIssues);

    // 5. Governance validation
    const governance = DecisionGovernanceValidator.validate(ctx, bundle.governance);

    // 6. Confidence calculation
    const supporting = [...bundle.lessons, ...bundle.bestPractices, ...bundle.governance];
    const confidence = DecisionConfidenceCalculator.calculate(supporting, governance, risk.risks.length);

    // 7. Advisory
    const advisory = DecisionKnowledgeAdvisor.advise(ctx, bundle, risk, constraints, governance, confidence);

    const durationMs = Date.now() - start;

    // 8. Audit
    DecisionKnowledgeAudit.log({
      decisionId:          ctx.decisionId,
      timestamp:           new Date().toISOString(),
      intent:              ctx.intent,
      knowledgeUsed:       bundle.all.map(i => i.id),
      governanceUsed:      bundle.governance.map(g => g.id),
      risksFound:          risk.risks.length,
      blockers:            risk.blockers.length,
      constraintsTotal:    constraints.constraints.length,
      confidence:          confidence.score,
      recommendedDecision: advisory.recommendedDecision,
      durationMs,
    });

    return { ctx, advisory, risk, constraints, governance, confidence, durationMs };
  },

  getMetrics() {
    return DecisionKnowledgeMetrics.snapshot();
  },
});