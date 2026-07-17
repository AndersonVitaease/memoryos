// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11B — EF-02: PipelineStage
// Canonical contract for every runtime stage in the execution pipeline.
// All stages receive ExecutionState — no ad-hoc input types in the interface.
// ══════════════════════════════════════════════════════════════════════════════

import type { ExecutionContext } from "./ExecutionContext";

/** Single-responsibility contract for every pipeline stage. */
export interface PipelineStage<I = unknown, O = unknown> {
  /** Unique stage identifier — must match ChainStage enum value. */
  readonly id: string;

  /** Execute the stage with a shared context and typed input. Returns typed output. */
  execute(context: ExecutionContext, input: I): Promise<O>;

  /** EF-18: Optional self-registration descriptor returned by each runtime stage. */
  descriptor?(): RuntimeDescriptor;
}

/** Returned by PipelineStage.health() — EF-11 */
export interface RuntimeHealth {
  readonly status:       "healthy" | "degraded" | "unhealthy";
  readonly uptime:       number;
  readonly version:      string;
  readonly dependencies: string[];
}

/**
 * EF-18 — Self Registration descriptor.
 * Each runtime stage exposes this to eliminate manual registration in ECR.
 */
export interface RuntimeDescriptor {
  readonly id:           string;
  readonly version:      string;
  readonly owner:        string;
  readonly capabilities: readonly string[];
  readonly dependencies: readonly string[];
  readonly lifecycle:    "singleton" | "scoped" | "transient";
  health(): RuntimeHealth;
}

/**
 * EF-17 — ExplainabilityEvidence V2
 * Collected automatically by ExecutionPipeline per stage.
 * Stages must NOT build Explainability manually.
 */
export interface ExplainabilityEvidence {
  readonly runtimeId:  string;
  readonly timestamp:  number;
  readonly durationMs: number;
  readonly input:      Record<string, unknown>;
  readonly output:     Record<string, unknown> | unknown;
  readonly decision:   string;
  readonly confidence: number;
  readonly policies:   readonly string[];
}