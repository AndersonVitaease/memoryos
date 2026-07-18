/**
 * EngineeringKnowledgeAdvisor.ts
 * Generates a structured knowledge advisory for the Engineering Runtime.
 *
 * SRP: Advisory generation only.
 * Sprint: INTEGRATION-05
 */

import type { KnowledgeResultItem }          from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { EngineeringKnowledgeContext }  from "./EngineeringKnowledgeContext";
import type { EngineeringRiskReport }        from "./EngineeringRiskAnalyzer";
import type { EngineeringGovernanceResult }  from "./EngineeringGovernanceValidator";
import type { EngineeringConstraints }       from "./EngineeringExecutionConstraints";
import type { EngineeringExecutionPlan }     from "./EngineeringExecutionStrategy";
import type { EngineeringConfidence }        from "./EngineeringConfidenceCalculator";

export interface AdvisoryEntry {
  readonly id:            string;
  readonly title:         string;
  readonly summary:       string;
  readonly evidenceScore: number;
}

export interface EngineeringAdvisory {
  readonly taskId:              string;
  readonly recommendedAction:   string;
  readonly proceed:             boolean;
  readonly reason:              string;
  readonly requiredReviews:     string[];
  readonly requiredTests:       string[];
  readonly lessonsApplied:      AdvisoryEntry[];
  readonly bestPracticesApplied:AdvisoryEntry[];
  readonly governanceApplied:   AdvisoryEntry[];
  readonly knownRisks:          AdvisoryEntry[];
  readonly confidence:          EngineeringConfidence;
  readonly generatedAt:         string;
}

function toEntry(item: KnowledgeResultItem): AdvisoryEntry {
  return Object.freeze({ id: item.id, title: item.title, summary: item.summary, evidenceScore: item.evidenceScore });
}

export const EngineeringKnowledgeAdvisor = Object.freeze({

  advise(
    ctx:         EngineeringKnowledgeContext,
    bundle:      { lessons: KnowledgeResultItem[]; bestPractices: KnowledgeResultItem[]; governance: KnowledgeResultItem[] },
    risk:        EngineeringRiskReport,
    govResult:   EngineeringGovernanceResult,
    constraints: EngineeringConstraints,
    plan:        EngineeringExecutionPlan,
    confidence:  EngineeringConfidence,
  ): EngineeringAdvisory {
    const blocked = risk.overallLevel === "CRITICAL" || govResult.blocked;
    const proceed = !blocked && confidence.level !== "INSUFFICIENT";

    const reason = blocked
      ? `Task blocked: ${risk.overallLevel} risk level or governance violation`
      : !proceed
      ? `Insufficient engineering confidence (${confidence.level})`
      : `Safe to proceed — ${confidence.level} confidence, ${plan.deploymentReadiness} deployment`;

    const recommendedAction = blocked
      ? "BLOCK_AND_ESCALATE"
      : !proceed
      ? "DEFER_FOR_REVIEW"
      : ctx.task;

    return Object.freeze({
      taskId:               ctx.taskId,
      recommendedAction,
      proceed,
      reason,
      requiredReviews:      constraints.mandatoryReviews,
      requiredTests:        constraints.requiredTests,
      lessonsApplied:       bundle.lessons.slice(0, 5).map(toEntry),
      bestPracticesApplied: bundle.bestPractices.slice(0, 5).map(toEntry),
      governanceApplied:    bundle.governance.slice(0, 5).map(toEntry),
      knownRisks:           risk.risks.slice(0, 5).map(r => ({
        id: r.id, title: r.title, summary: r.description, evidenceScore: r.evidenceScore,
      })),
      confidence,
      generatedAt: new Date().toISOString(),
    });
  },
});