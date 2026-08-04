/**
 * outcomeAdapter.ts — EI-04 shared adapter (RFC-008 / ADR-015)
 *
 * Mapeia um ExecutionOutcome (produzido pela cadeia Execution Intelligence) de
 * volta ao shape ExecutionResult que o ConnectorResultSynthesizer e o
 * ConversationPipeline consomem.
 *
 * Compartilhado entre o path multi-intent (ConnectorGoalIntentExecutor) e o
 * path principal (ConversationPipeline) — extracao para evitar duplicacao.
 */
import type { ExecutionOutcome } from "./ExecutionTypes";
import type { ExecutionResult } from "@/lib/runtime-engine/RuntimeTypes";

export function outcomeToExecutionResult(outcome: ExecutionOutcome, executionId: string): ExecutionResult {
  const now = Date.now();
  const durationMs = outcome.durationMs ?? 0;
  return {
    executionId: outcome.executionId ?? executionId,
    planId: "ei-adapter",
    goalId: `ei-${outcome.executionId ?? executionId}`,
    status: "completed",
    steps: [
      {
        stepId: "ei-step-1",
        connector: outcome.connectorId,
        capability: outcome.capability,
        status: "completed",
        output: outcome.output,
        error: null,
        startedAt: now - durationMs,
        finishedAt: now,
        durationMs,
        attempt: 1,
      },
    ],
    startedAt: now - durationMs,
    finishedAt: now,
    durationMs,
    errors: [],
  };
}

export function outcomeToFailedResult(
  outcome: ExecutionOutcome,
  executionId: string,
  connectorId: string,
  capability: string,
): ExecutionResult {
  const now = Date.now();
  const durationMs = outcome.durationMs ?? 0;
  const msg = outcome.message ?? "Falha apos confirmacao.";
  return {
    executionId: outcome.executionId ?? executionId,
    planId: "ei-adapter",
    goalId: `ei-${outcome.executionId ?? executionId}`,
    status: "failed",
    steps: [
      {
        stepId: "ei-step-1",
        connector: connectorId,
        capability,
        status: "failed",
        output: null,
        error: msg,
        startedAt: now - durationMs,
        finishedAt: now,
        durationMs,
        attempt: 1,
      },
    ],
    startedAt: now - durationMs,
    finishedAt: now,
    durationMs,
    errors: [msg],
  };
}