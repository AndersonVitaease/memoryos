/**
 * ConnectorExecutionConstraints.ts
 * Derives hard execution constraints from governance + risk knowledge.
 *
 * SRP: Constraint construction only.
 * Sprint: INTEGRATION-04
 */

import type { KnowledgeResultItem } from "@/lib/knowledge-query/KnowledgeQueryTypes";
import type { ConnectorKnowledgeContext } from "./ConnectorKnowledgeContext";
import type { ConnectorRiskReport }       from "./ConnectorRiskAnalyzer";

export interface ExecutionConstraints {
  readonly requestId:        string;
  readonly maxRetries:       number;
  readonly timeoutMs:        number;
  readonly mandatoryLogging: boolean;
  readonly requiresReview:   boolean;
  readonly blockedProviders: string[];
  readonly allowedProviders: string[];
  readonly securityLevel:    "STANDARD" | "ELEVATED" | "STRICT";
  readonly rateLimitedOps:   string[];
}

export const ConnectorExecutionConstraints = Object.freeze({

  build(
    ctx:        ConnectorKnowledgeContext,
    risk:       ConnectorRiskReport,
    governance: KnowledgeResultItem[],
  ): ExecutionConstraints {
    const hasRateLimit    = risk.retryRisk;
    const hasTimeout      = risk.timeoutRisk;
    const highRisk        = risk.overallLevel === "CRITICAL" || risk.overallLevel === "HIGH";
    const criticalPrio    = ctx.priority === "CRITICAL";

    const maxRetries    = hasRateLimit ? 1 : highRisk ? 2 : 3;
    const timeoutMs     = hasTimeout   ? 5000 : criticalPrio ? 10000 : 30000;
    const securityLevel = criticalPrio ? "STRICT" : highRisk ? "ELEVATED" : "STANDARD";

    const blockedProviders: string[] = governance
      .filter(g => (g.title + g.summary).toLowerCase().includes("blocked"))
      .map(g => g.source);

    const rateLimitedOps = risk.risks
      .filter(r => r.category === "RATE_LIMIT")
      .map(r => r.title);

    return Object.freeze({
      requestId:        ctx.requestId,
      maxRetries,
      timeoutMs,
      mandatoryLogging: highRisk || criticalPrio,
      requiresReview:   criticalPrio || risk.blockers.length > 0,
      blockedProviders,
      allowedProviders: [],
      securityLevel,
      rateLimitedOps,
    });
  },
});