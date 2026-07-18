/**
 * ConnectorExecutionReport.ts
 * Immutable record of a completed connector knowledge pipeline run.
 *
 * SRP: Report construction only.
 * Sprint: INTEGRATION-04
 */

import type { ConnectorKnowledgeContext }    from "./ConnectorKnowledgeContext";
import type { ConnectorExecutionAdvisory }   from "./ConnectorExecutionAdvisor";
import type { ConnectorExecutionPlan }       from "./ConnectorExecutionStrategy";
import type { ConnectorRiskReport }          from "./ConnectorRiskAnalyzer";
import type { ConnectorGovernanceResult }    from "./ConnectorGovernanceValidator";
import type { ConnectorExecutionConfidence } from "./ConnectorConfidenceCalculator";

export type ExecutionResult = "SUCCESS" | "BLOCKED" | "FALLBACK" | "RETRIED" | "FAILED";

export interface ConnectorExecutionReport {
  readonly reportId:         string;
  readonly requestId:        string;
  readonly connector:        string;
  readonly provider:         string;
  readonly operation:        string;
  readonly knowledgeUsed:    number;
  readonly governanceUsed:   number;
  readonly strategyUsed:     string;
  readonly fallbackUsed:     boolean;
  readonly retriesUsed:      number;
  readonly timeoutMs:        number;
  readonly result:           ExecutionResult;
  readonly riskLevel:        string;
  readonly confidence:       number;
  readonly durationMs:       number;
  readonly generatedAt:      string;
}

let _counter = 0;

export const ConnectorExecutionReportBuilder = Object.freeze({

  build(
    ctx:      ConnectorKnowledgeContext,
    advisory: ConnectorExecutionAdvisory,
    plan:     ConnectorExecutionPlan,
    risk:     ConnectorRiskReport,
    durationMs: number,
  ): ConnectorExecutionReport {
    _counter++;
    const result: ExecutionResult =
      !advisory.proceed                 ? "BLOCKED"
      : risk.overallLevel === "HIGH"    ? "RETRIED"
      : plan.fallbackStrategy !== "NONE" && plan.circuitBreaker !== "CLOSED" ? "FALLBACK"
      : "SUCCESS";

    return Object.freeze({
      reportId:       `CER-${String(_counter).padStart(3, "0")}`,
      requestId:      ctx.requestId,
      connector:      ctx.connector,
      provider:       ctx.provider,
      operation:      ctx.operation,
      knowledgeUsed:  advisory.lessonsApplied.length + advisory.bestPracticesApplied.length + advisory.governanceApplied.length,
      governanceUsed: advisory.governanceApplied.length,
      strategyUsed:   plan.retryStrategy,
      fallbackUsed:   plan.fallbackStrategy !== "NONE" && !advisory.proceed,
      retriesUsed:    result === "RETRIED" ? plan.maxRetries : 0,
      timeoutMs:      plan.timeoutMs,
      result,
      riskLevel:      risk.overallLevel,
      confidence:     advisory.confidence.score,
      durationMs,
      generatedAt:    new Date().toISOString(),
    });
  },
});