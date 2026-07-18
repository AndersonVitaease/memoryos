/**
 * DecisionKnowledgeAdvisor.ts
 * Generates structured decision recommendations from knowledge signals.
 *
 * SRP: Advisory generation only.
 * Sprint: INTEGRATION-03
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { DecisionKnowledgeContext, DecisionType } from "./DecisionKnowledgeContext";
import type { RiskReport } from "./DecisionRiskAnalyzer";
import type { ConstraintReport } from "./DecisionConstraintResolver";
import type { GovernanceValidationResult } from "./DecisionGovernanceValidator";
import type { DecisionConfidence } from "./DecisionConfidenceCalculator";

export interface DecisionAdvisoryEntry {
  readonly id:           string;
  readonly title:        string;
  readonly summary:      string;
  readonly evidenceScore:number;
  readonly confidence:   number;
  readonly source:       string;
}

export interface DecisionAdvisory {
  readonly decisionId:            string;
  readonly recommendedDecision:   DecisionType;
  readonly alternativeDecisions:  DecisionType[];
  readonly rejectedDecisions:     Array<{ decision: DecisionType; reason: string }>;
  readonly knownRisks:            DecisionAdvisoryEntry[];
  readonly lessonsApplied:        DecisionAdvisoryEntry[];
  readonly bestPracticesApplied:  DecisionAdvisoryEntry[];
  readonly governanceApplied:     DecisionAdvisoryEntry[];
  readonly confidence:            DecisionConfidence;
  readonly generatedAt:           string;
}

function toEntry(item: KnowledgeResultItem): DecisionAdvisoryEntry {
  return {
    id:            item.id,
    title:         item.title,
    summary:       item.summary,
    evidenceScore: item.evidenceScore,
    confidence:    item.confidence,
    source:        item.source,
  };
}

function recommend(
  ctx:         DecisionKnowledgeContext,
  risk:        RiskReport,
  constraints: ConstraintReport,
  govResult:   GovernanceValidationResult,
  confidence:  DecisionConfidence,
): { recommended: DecisionType; alternatives: DecisionType[]; rejected: Array<{ decision: DecisionType; reason: string }> } {
  const rejected: Array<{ decision: DecisionType; reason: string }> = [];

  if (risk.overallLevel === "CRITICAL" || constraints.blocked) {
    rejected.push({ decision: "APPROVE", reason: "Critical risk or mandatory constraint blocks approval" });
    return { recommended: "ESCALATE", alternatives: ["DEFER", "DELEGATE"], rejected };
  }
  if (!govResult.compliant) {
    rejected.push({ decision: ctx.decisionType, reason: "Governance violation detected" });
    return { recommended: "DEFER", alternatives: ["DELEGATE", "ESCALATE"], rejected };
  }
  if (confidence.level === "INSUFFICIENT" || confidence.level === "LOW") {
    return { recommended: "DEFER", alternatives: ["DELEGATE"], rejected };
  }
  if (risk.overallLevel === "HIGH") {
    return { recommended: "DELEGATE", alternatives: [ctx.decisionType, "DEFER"], rejected };
  }

  return { recommended: ctx.decisionType, alternatives: ["DEFER", "DELEGATE"], rejected };
}

export const DecisionKnowledgeAdvisor = Object.freeze({

  advise(
    ctx:         DecisionKnowledgeContext,
    bundle:      { lessons: KnowledgeResultItem[]; bestPractices: KnowledgeResultItem[]; knownIssues: KnowledgeResultItem[]; governance: KnowledgeResultItem[] },
    risk:        RiskReport,
    constraints: ConstraintReport,
    govResult:   GovernanceValidationResult,
    confidence:  DecisionConfidence,
  ): DecisionAdvisory {
    const { recommended, alternatives, rejected } = recommend(ctx, risk, constraints, govResult, confidence);

    return {
      decisionId:           ctx.decisionId,
      recommendedDecision:  recommended,
      alternativeDecisions: alternatives,
      rejectedDecisions:    rejected,
      knownRisks:           risk.risks.slice(0, 5).map(r => ({ id: r.id, title: r.title, summary: r.description, evidenceScore: 60, confidence: r.confidence, source: r.source })),
      lessonsApplied:       bundle.lessons.slice(0, 5).map(toEntry),
      bestPracticesApplied: bundle.bestPractices.slice(0, 5).map(toEntry),
      governanceApplied:    bundle.governance.slice(0, 5).map(toEntry),
      confidence,
      generatedAt:          new Date().toISOString(),
    };
  },
});