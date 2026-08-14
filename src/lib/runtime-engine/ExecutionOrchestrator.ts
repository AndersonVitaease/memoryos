/**
 * ExecutionOrchestrator.ts — minimal parallel execution layer.
 *
 * SRP: schedule independent ExecutionSteps concurrently while preserving
 * legacy sequential behavior for steps that do not declare dependencies.
 *
 * This is infrastructure, not a cognitive engine. It does not know about
 * connectors, OAuth, LLMs, or business logic; it only coordinates dispatch.
 */

import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { StepResult } from "./RuntimeTypes";

export interface ExecutionOrchestratorInput {
  readonly steps: readonly ExecutionStep[];
  readonly dispatchStep: (step: ExecutionStep) => Promise<StepResult>;
  readonly isCancelled: () => boolean;
  readonly deadlineAt: number;
}

export interface ExecutionOrchestratorResult {
  readonly results: readonly StepResult[];
  readonly stoppedOnFailure: boolean;
}

export class ExecutionOrchestrator {
  /**
   * Executes the plan in dependency waves.
   *
   * Legacy step (dependsOn omitted): depends on the previous plan step.
   * Explicit dependsOn=[]: independent root, eligible for parallel execution.
   * Explicit dependencies: step waits until all referenced steps complete.
   */
  async execute(input: ExecutionOrchestratorInput): Promise<ExecutionOrchestratorResult> {
    const { steps, dispatchStep, isCancelled, deadlineAt } = input;
    const byId = new Map(steps.map((step) => [step.id, step]));
    const remaining = new Set(steps.map((_, index) => index));
    const completed = new Set<string>();
    const results: StepResult[] = [];

    for (const step of steps) {
      for (const dependency of this._dependencies(step, steps)) {
        if (!byId.has(dependency)) {
          throw new Error(`ExecutionOrchestrator: unknown dependency '${dependency}' for step '${step.id}'`);
        }
      }
    }

    while (remaining.size > 0) {
      if (isCancelled()) {
        return { results: Object.freeze(results), stoppedOnFailure: false };
      }
      if (Date.now() > deadlineAt) {
        return { results: Object.freeze(results), stoppedOnFailure: true };
      }

      const ready = [...remaining].filter((index) => {
        const step = steps[index];
        return this._dependencies(step, steps).every((dependency) => completed.has(dependency));
      });

      if (ready.length === 0) {
        throw new Error("ExecutionOrchestrator: cyclic or unresolved execution dependencies");
      }

      const waveResults = await Promise.all(ready.map((index) => dispatchStep(steps[index])));

      ready.forEach((index, position) => {
        remaining.delete(index);
        const result = waveResults[position];
        results.push(result);
        if (result.status === "completed") completed.add(steps[index].id);
      });

      if (waveResults.some((result) => result.status === "failed" || result.status === "timeout")) {
        return { results: Object.freeze(this._orderedResults(results, steps)), stoppedOnFailure: true };
      }
    }

    return { results: Object.freeze(this._orderedResults(results, steps)), stoppedOnFailure: false };
  }

  private _orderedResults(results: readonly StepResult[], steps: readonly ExecutionStep[]): StepResult[] {
    const order = new Map(steps.map((step, index) => [step.id, index]));
    return [...results].sort((a, b) => (order.get(a.stepId) ?? 0) - (order.get(b.stepId) ?? 0));
  }

  private _dependencies(step: ExecutionStep, steps: readonly ExecutionStep[]): readonly string[] {
    if (step.dependsOn !== undefined) return step.dependsOn;
    const index = steps.findIndex((candidate) => candidate.id === step.id);
    return index > 0 ? [steps[index - 1].id] : [];
  }
}
