/**
 * ConnectorExecutionAdvisor.ts
 * Generates a structured execution advisory for the Connector Runtime.
 *
 * SRP: Advisory generation only.
 * Sprint: INTEGRATION-04
 */

import type { KnowledgeResultItem }           from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { ConnectorKnowledgeContext }     from "./ConnectorKnowledgeContext";
import type { ConnectorRiskReport }           from "./ConnectorRiskAnalyzer";
import type { ConnectorGovernanceResult }     from "./ConnectorGovernanceValidator";
import type { ConnectorExecutionConfidence }  from "./ConnectorConfidenceCalculator";
import type { ConnectorExecutionPlan }        from "./ConnectorExecutionStrategy";

export interface AdvisoryKnowledgeEntry {
  readonly id:            string;
  readonly title:         string;
  readonly summary:       string;
  readonly evidenceScore: number;
}

export interface ConnectorExecutionAdvisory {
  readonly requestId:           string;
  readonly recommendedConnector:string;
  readonly alternativeProvider: string | null;
  readonly proceed:             boolean;
  readonly reason:              string;
  readonly knownRisks:          AdvisoryKnowledgeEntry[];
  readonly lessonsApplied:      AdvisoryKnowledgeEntry[];
  readonly bestPracticesApplied:AdvisoryKnowledgeEntry[];
  readonly governanceApplied:   AdvisoryKnowledgeEntry[];
  readonly retryStrategy:       string;
  readonly fallbackStrategy:    string;
  readonly confidence:          ConnectorExecutionConfidence;
  readonly generatedAt:         string;
}

function toEntry(item: KnowledgeResultItem): AdvisoryKnowledgeEntry {
  return Object.freeze({
    id:            item.id,
    title:         item.title,
    summary:       item.summary,
    evidenceScore: item.evidenceScore,
  });
}

export const ConnectorExecutionAdvisor = Object.freeze({

  advise(
    ctx:      ConnectorKnowledgeContext,
    bundle:   { lessons: KnowledgeResultItem[]; bestPractices: KnowledgeResultItem[]; governance: KnowledgeResultItem[] },
    risk:     ConnectorRiskReport,
    govResult:ConnectorGovernanceResult,
    plan:     ConnectorExecutionPlan,
    conf:     ConnectorExecutionConfidence,
  ): ConnectorExecutionAdvisory {
    const blocked = risk.overallLevel === "CRITICAL" || govResult.blocked;
    const proceed = !blocked && conf.level !== "INSUFFICIENT";

    const reason = blocked
      ? `Execution blocked: ${risk.overallLevel} risk or governance violation`
      : !proceed
      ? `Insufficient execution confidence (${conf.level})`
      : `Safe to proceed — ${conf.level} confidence`;

    const altProvider = plan.providerPriority.length > 1
      ? plan.providerPriority[1]
      : null;

    return Object.freeze({
      requestId:            ctx.requestId,
      recommendedConnector: proceed ? ctx.connector : "BLOCKED",
      alternativeProvider:  altProvider,
      proceed,
      reason,
      knownRisks:           risk.risks.slice(0, 5).map(r => ({
        id: r.id, title: r.title, summary: r.description, evidenceScore: r.evidenceScore,
      })),
      lessonsApplied:       bundle.lessons.slice(0, 5).map(toEntry),
      bestPracticesApplied: bundle.bestPractices.slice(0, 5).map(toEntry),
      governanceApplied:    bundle.governance.slice(0, 5).map(toEntry),
      retryStrategy:        plan.retryStrategy,
      fallbackStrategy:     plan.fallbackStrategy,
      confidence:           conf,
      generatedAt:          new Date().toISOString(),
    });
  },
});