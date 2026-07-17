// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-05: ExecutionContext
// Shared context passed to every pipeline stage. No stage receives dozens of
// parameters — all shared services live here.
// ══════════════════════════════════════════════════════════════════════════════

import type { IClock }               from "../runtime-infra/RuntimeClockTypes";
import type { IExecutionIdProvider } from "../runtime-infra/RuntimeExecutionIdProvider";
import type { RuntimeEventBus }      from "../runtime-infra/RuntimeEventBus";
import type { RuntimeMetrics }       from "../runtime-infra/RuntimeMetrics";
import type { IConnectorRegistry }   from "./ConnectorRegistry";
import type { RuntimeRegistry }      from "./RuntimeRegistry";
import type { RuntimeAuditSink }     from "./RuntimeAuditSink";
import type { ExplainabilityEvidence } from "./PipelineStage";

/** Immutable configuration carried for the lifetime of a single execution. */
export interface ExecutionConfig {
  readonly maxTimeMs:    number;
  readonly maxRetries:   number;
  readonly environment:  "production" | "staging" | "test";
}

/** Permissions scoped to this execution. */
export interface ExecutionPermissions {
  readonly userId:  string;
  readonly scopes:  readonly string[];
  readonly roles:   readonly string[];
}

/**
 * ExecutionContext — the single parameter received by every PipelineStage.
 * Replaces all ad-hoc constructor injection that was spread across stages.
 */
export interface ExecutionContext {
  // Identity
  readonly executionId: string;
  readonly sessionId:   string;

  // Infrastructure services
  readonly clock:              IClock;
  readonly idProvider:         IExecutionIdProvider;
  readonly eventBus:           RuntimeEventBus;
  readonly metrics:            RuntimeMetrics;
  readonly auditSink:          RuntimeAuditSink;

  // Domain services
  readonly connectorRegistry:  IConnectorRegistry;
  readonly runtimeRegistry:    RuntimeRegistry;

  // Execution scope
  readonly permissions:        ExecutionPermissions;
  readonly config:             ExecutionConfig;

  // Evidence accumulator — stages append their ExplainabilityEvidence here
  readonly evidences:          ExplainabilityEvidence[];
}