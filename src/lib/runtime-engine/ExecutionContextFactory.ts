/**
 * ExecutionContextFactory.ts — Engineering Sprint E-02.3A
 * Factory responsible for creating and validating RuntimeExecutionContexts.
 *
 * SRP: única responsabilidade — criar, inicializar e validar contextos.
 * O Runtime apenas chama ExecutionContextFactory.create() — não constrói contextos.
 *
 * Nenhum connector, nenhuma rede, nenhum OAuth.
 */

import type { ExecutionPlan }           from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { RuntimeExecutionContext } from "./RuntimeTypes";
import type { ExecutionPolicy }         from "./ExecutionPolicy";
import { DEFAULT_EXECUTION_POLICY }    from "./ExecutionPolicy";
import { makeExecutionId }             from "./RuntimeTypes";

// ── Validation result ─────────────────────────────────────────────────────────

export interface ContextValidationResult {
  readonly valid:  boolean;
  readonly errors: readonly string[];
}

// ── ExecutionContextFactory ───────────────────────────────────────────────────

export class ExecutionContextFactory {
  /**
   * Validates a plan before creating a context.
   * Returns { valid: true } when the plan is safe to execute.
   */
  validate(plan: ExecutionPlan): ContextValidationResult {
    const errors: string[] = [];

    if (!plan.id)     errors.push("plan.id is required");
    if (!plan.goalId) errors.push("plan.goalId is required");

    if (plan.status === "invalid_goal") {
      errors.push("plan.status is invalid_goal — cannot execute");
    }

    for (const step of plan.steps) {
      if (!step.id)         errors.push(`step missing id`);
      if (!step.connector)  errors.push(`step ${step.id}: connector is required`);
      if (!step.capability) errors.push(`step ${step.id}: capability is required`);
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }

  /**
   * Creates an initialized RuntimeExecutionContext for the given plan and policy.
   * The context starts in "queued" status — the Runtime transitions it to "running".
   *
   * @throws never — returns null on invalid plan instead
   */
  create(
    plan:   ExecutionPlan,
    policy: ExecutionPolicy = DEFAULT_EXECUTION_POLICY,
  ): RuntimeExecutionContext | null {
    const validation = this.validate(plan);
    if (!validation.valid) return null;

    const executionId = makeExecutionId();

    return {
      executionId,
      planId:          plan.id,
      goalId:          plan.goalId,
      plan,
      createdAt:       Date.now(),
      startedAt:       null,
      finishedAt:      null,
      status:          "queued",
      currentStepIndex: -1,
      stepResults:     [],
      cancelRequested: false,
      timeoutAt:       null,
      metadata:        {
        policy,
        stepCount: plan.steps.length,
        goalType:  plan.goalType,
      },
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const executionContextFactory = new ExecutionContextFactory();