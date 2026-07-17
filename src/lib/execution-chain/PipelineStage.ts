// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-02: PipelineStage
// Canonical contract for every runtime stage in the execution pipeline.
// All 11 runtime stages implement this interface — no exceptions.
// ══════════════════════════════════════════════════════════════════════════════

import type { ExecutionContext } from "./ExecutionContext";

/** Single-responsibility contract for every pipeline stage. */
export interface PipelineStage<I = unknown, O = unknown> {
  /** Unique stage identifier — must match ChainStage enum value. */
  readonly id: string;

  /** Execute the stage with a shared context and typed input. Returns typed output. */
  execute(context: ExecutionContext, input: I): Promise<O>;

  /** Optional: runtime health status for RuntimeRegistry. */
  health?(): RuntimeHealth;
}

/** Returned by PipelineStage.health() — EF-11 */
export interface RuntimeHealth {
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly uptime: number;
  readonly version: string;
  readonly dependencies: string[];
}

/** Evidence produced by each stage — EF-06 ExplainabilityEvidence V2 */
export interface ExplainabilityEvidence {
  readonly runtime: string;
  readonly decision: string;
  readonly confidence: number;
  readonly inputs: Record<string, unknown>;
  readonly outputs: Record<string, unknown>;
  readonly reasoning: string;
  readonly policies: string[];
  readonly timestamp: number;
}