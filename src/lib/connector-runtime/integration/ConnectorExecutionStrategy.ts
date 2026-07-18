/**
 * ConnectorExecutionStrategy.ts
 * Selects retry, fallback, timeout and circuit-breaker strategies
 * based on knowledge signals and risk profile.
 *
 * SRP: Strategy selection only.
 * Sprint: INTEGRATION-04
 */

import type { ConnectorKnowledgeContext }     from "./ConnectorKnowledgeContext";
import type { ConnectorRiskReport }           from "./ConnectorRiskAnalyzer";
import type { ExecutionConstraints }          from "./ConnectorExecutionConstraints";
import type { ConnectorExecutionConfidence }  from "./ConnectorConfidenceCalculator";

export type RetryStrategy   = "NONE" | "LINEAR" | "EXPONENTIAL" | "JITTER";
export type FallbackStrategy= "NONE" | "CACHE" | "DEGRADED" | "ALTERNATE_PROVIDER" | "ABORT";
export type CircuitBreaker  = "CLOSED" | "HALF_OPEN" | "OPEN";

export interface ConnectorExecutionPlan {
  readonly requestId:        string;
  readonly retryStrategy:    RetryStrategy;
  readonly maxRetries:       number;
  readonly retryDelayMs:     number;
  readonly fallbackStrategy: FallbackStrategy;
  readonly circuitBreaker:   CircuitBreaker;
  readonly timeoutMs:        number;
  readonly providerPriority: string[];
  readonly executionOrder:   string[];
  readonly recoveryStrategy: string;
}

export const ConnectorExecutionStrategy = Object.freeze({

  select(
    ctx:         ConnectorKnowledgeContext,
    risk:        ConnectorRiskReport,
    constraints: ExecutionConstraints,
    confidence:  ConnectorExecutionConfidence,
  ): ConnectorExecutionPlan {
    // Retry strategy
    let retryStrategy: RetryStrategy = "LINEAR";
    if (risk.retryRisk)                              retryStrategy = "EXPONENTIAL";
    if (risk.overallLevel === "CRITICAL")            retryStrategy = "NONE";
    if (constraints.maxRetries === 0)                retryStrategy = "NONE";
    if (confidence.level === "VERY_HIGH")            retryStrategy = "LINEAR";

    // Delay
    const retryDelayMs = retryStrategy === "EXPONENTIAL" ? 2000 : retryStrategy === "LINEAR" ? 1000 : 0;

    // Fallback
    let fallbackStrategy: FallbackStrategy = "CACHE";
    if (risk.overallLevel === "CRITICAL")            fallbackStrategy = "ABORT";
    else if (risk.overallLevel === "HIGH")           fallbackStrategy = "DEGRADED";
    else if (confidence.level === "INSUFFICIENT")    fallbackStrategy = "ALTERNATE_PROVIDER";
    else if (ctx.operation === "WRITE" || ctx.operation === "DELETE") fallbackStrategy = "ABORT";

    // Circuit breaker
    let circuitBreaker: CircuitBreaker = "CLOSED";
    if (risk.overallLevel === "CRITICAL")            circuitBreaker = "OPEN";
    else if (risk.overallLevel === "HIGH")           circuitBreaker = "HALF_OPEN";

    // Provider priority (primary first, then alternatives)
    const providerPriority = constraints.blockedProviders.includes(ctx.provider)
      ? ["FALLBACK"]
      : [ctx.provider, "FALLBACK"];

    // Recovery
    const recoveryStrategy = risk.overallLevel === "CRITICAL"
      ? "ESCALATE_TO_HUMAN"
      : risk.overallLevel === "HIGH"
      ? "QUEUE_FOR_RETRY"
      : "AUTO_RECOVER";

    return Object.freeze({
      requestId:        ctx.requestId,
      retryStrategy,
      maxRetries:       constraints.maxRetries,
      retryDelayMs,
      fallbackStrategy,
      circuitBreaker,
      timeoutMs:        constraints.timeoutMs,
      providerPriority,
      executionOrder:   [ctx.connector, ...providerPriority],
      recoveryStrategy,
    });
  },
});