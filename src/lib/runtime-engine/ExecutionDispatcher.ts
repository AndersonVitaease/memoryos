/**
 * ExecutionDispatcher.ts — Engineering Sprint E-02.3A
 * Intermediary layer between the Runtime and the CapabilityExecutor.
 *
 * SRP: receber um ExecutionStep, resolver o executor correto, executar,
 *      e retornar um StepResult.
 *
 * O Runtime nunca invoca um executor diretamente — sempre via Dispatcher.
 *
 * Open/Closed: na Sprint E-02.4, o ConnectorRouter será plugado aqui
 * como ICapabilityExecutor — sem alterar o Runtime nem este Dispatcher.
 *
 * Dependency Inversion: depende de ICapabilityExecutor (interface),
 * não de MockCapabilityExecutor ou ConnectorRouter (implementações).
 *
 * Nenhum connector real, nenhuma rede, nenhum OAuth.
 */

import type { ExecutionStep }          from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type {
  ICapabilityExecutor,
  StepResult,
  StepStatus,
  RetryContext,
} from "./RuntimeTypes";

// ── DispatchInput ─────────────────────────────────────────────────────────────

export interface DispatchInput {
  readonly executionId:   string;
  readonly step:          ExecutionStep;
  readonly stepTimeoutMs: number;
}

// ── ExecutionDispatcher ───────────────────────────────────────────────────────

export class ExecutionDispatcher {
  constructor(private readonly _executor: ICapabilityExecutor) {}

  /**
   * Dispatches a single step to the registered executor.
   * Applies step-level timeout via Promise.race.
   * Never throws — always returns a StepResult.
   */
  async dispatch(input: DispatchInput): Promise<StepResult> {
    const { executionId, step, stepTimeoutMs } = input;
    const startedAt  = Date.now();
    const retryCtx: RetryContext = { attempt: 1, maxAttempts: 1, lastError: null };

    try {
      const outputPromise = this._executor.execute({ executionId, step, retryCtx });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Step timeout")), Math.max(stepTimeoutMs, 100)),
      );

      const output     = await Promise.race([outputPromise, timeoutPromise]);
      const finishedAt = Date.now();

      return Object.freeze({
        stepId:     step.id,
        connector:  step.connector,
        capability: step.capability,
        status:     output.status as StepStatus,
        output:     output.output,
        error:      output.error,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        attempt:    1,
      });
    } catch (err) {
      const finishedAt = Date.now();
      const isTimeout  = (err as Error).message === "Step timeout";

      return Object.freeze({
        stepId:     step.id,
        connector:  step.connector,
        capability: step.capability,
        status:     (isTimeout ? "timeout" : "failed") as StepStatus,
        output:     null,
        error:      (err as Error).message,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        attempt:    1,
      });
    }
  }
}