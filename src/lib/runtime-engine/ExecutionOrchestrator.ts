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
import type { ParallelismConfig } from "./ExecutionPolicy";

export interface ExecutionOrchestratorInput {
  readonly steps: readonly ExecutionStep[];
  readonly dispatchStep: (step: ExecutionStep) => Promise<StepResult>;
  readonly isCancelled: () => boolean;
  readonly deadlineAt: number;
  /** Bounded concurrency / backpressure for ready steps within a wave.
   *  enabled=false (default) preserves the original Promise.all behavior:
   *  all ready steps dispatch simultaneously. enabled=true caps in-flight
   *  ready steps at maxConcurrent, with real awaiting (no polling/errors). */
  readonly parallelism?: ParallelismConfig;
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
    const parallelism: ParallelismConfig = input.parallelism ?? { enabled: false, maxConcurrent: 1 };
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

      // O Orchestrator mede semaphore_wait_ms em _runBounded (bounded concurrency).
      // Sem semaphore (parallelism.enabled=false) → 0 (sem espera).
      const waveResults = parallelism.enabled && parallelism.maxConcurrent > 0
        ? await this._runBounded(ready, parallelism.maxConcurrent, (index, waitMs) => dispatchStep(steps[index], waitMs))
        : await Promise.all(ready.map((index) => dispatchStep(steps[index], 0)));

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

  /**
   * Bounded concurrency dispatcher (real backpressure via promise chaining).
   * At most `maxConcurrent` ready steps are in flight at once; the rest
   * await an acquired slot. No polling, no capacity-error, no retry-as-queue.
   * Results are returned in input order (Promise.all semantics), so the
   * existing waveResults[position] <-> ready[position] mapping is preserved.
   */
  private async _runBounded<T>(
    items: readonly number[],
    maxConcurrent: number,
    fn: (index: number, semaphoreWaitMs: number) => Promise<T>,
  ): Promise<T[]> {
    const limit = Math.max(1, Math.floor(maxConcurrent) || 1);
    let available = limit;
    const waiters: Array<() => void> = [];
    // Todos os itens desta wave ficaram READY neste instante (o ready set da
    // wave acabou de ser computado). semaphore_wait_ms = acquiredAt - readyAt:
    // tempo entre o step estar pronto e adquirir vaga no semaphore.
    const readyAt = Date.now();
    const acquire = (): Promise<void> => {
      if (available > 0) { available--; return Promise.resolve(); }
      return new Promise<void>((resolve) => waiters.push(resolve));
    };
    const release = (): void => {
      const next = waiters.shift();
      if (next) next();
      else available++;
    };
    return Promise.all(
      items.map(async (index) => {
        await acquire();
        const semaphoreWaitMs = Date.now() - readyAt;
        try {
          return await fn(index, semaphoreWaitMs);
        } finally {
          release();
        }
      }),
    );
  }
}