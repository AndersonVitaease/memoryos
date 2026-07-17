// ══════════════════════════════════════════════════════════════════════════════
// Sprint P-01.11A — EF-10: PipelineValidator
// Validates the assembled pipeline BEFORE execution begins.
// Any validation failure must prevent execution.
// ══════════════════════════════════════════════════════════════════════════════

import type { PipelineStage } from "./PipelineStage";

export interface ValidationResult {
  readonly valid:    boolean;
  readonly errors:   readonly string[];
  readonly warnings: readonly string[];
}

const REQUIRED_STAGES = [
  "USER_INPUT", "INTENT_RUNTIME", "GOAL_RUNTIME", "PLANNING_RUNTIME",
  "KERNEL", "RUNTIME_ORCHESTRATOR", "CAPABILITY_RUNTIME", "CONNECTOR_RUNTIME",
  "CONNECTOR", "RESULT", "MEMORY", "EXPLAINABILITY", "AUDIT",
] as const;

export class PipelineValidator {
  validate(stages: PipelineStage[]): ValidationResult {
    const errors:   string[] = [];
    const warnings: string[] = [];

    // ✓ Check for duplications
    const ids = stages.map(s => s.id);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`DUPLICATE_STAGE:${id}`);
      seen.add(id);
    }

    // ✓ Check required stages are all present
    for (const req of REQUIRED_STAGES) {
      if (!ids.includes(req)) errors.push(`MISSING_STAGE:${req}`);
    }

    // ✓ Check ordering — stages must appear in canonical order
    const presentRequired = REQUIRED_STAGES.filter(r => ids.includes(r));
    for (let i = 1; i < presentRequired.length; i++) {
      const prev = ids.indexOf(presentRequired[i - 1]);
      const curr = ids.indexOf(presentRequired[i]);
      if (curr <= prev) {
        errors.push(`ORDER_VIOLATION:${presentRequired[i - 1]}>>${presentRequired[i]}`);
      }
    }

    // ✓ Check total count
    if (stages.length < REQUIRED_STAGES.length) {
      errors.push(`INSUFFICIENT_STAGES:${stages.length}/${REQUIRED_STAGES.length}`);
    }

    // ✓ Check no null/undefined stages
    for (let i = 0; i < stages.length; i++) {
      if (!stages[i]) errors.push(`NULL_STAGE_AT_INDEX:${i}`);
    }

    // ✓ Connectivity — every stage must have a valid execute function
    for (const stage of stages) {
      if (stage && typeof stage.execute !== "function") {
        errors.push(`INVALID_STAGE_INTERFACE:${stage.id}`);
      }
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
  }
}