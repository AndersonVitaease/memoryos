/**
 * DynamicWaveRunner.ts — Dynamic Re-planning V1
 *
 * Transforma o re-planning do AdaptiveProcess em waves dinamicas executadas
 * pelo ExecutionOrchestrator. NAO e uma engine, planner ou scheduler — e um
 * orquestrador de loop que reutiliza infraestrutura existente.
 *
 * Fluxo:
 *   plan() → wave 1 → ExecutionOrchestrator → reflect()
 *   → se gap → planNextWave() → wave 2 → ExecutionOrchestrator → reflect()
 *   → ... → stop → synthesize
 *
 * Garantias:
 *   - Cada wave e executada pelo ExecutionOrchestrator (resource-aware concurrency,
 *     MCP tool_policy, semaphore/backpressure preservados).
 *   - Steps da wave N+1 NAO existiam no plano inicial (born from real output).
 *   - Deduplicacao deterministica por (connector, capability, params) por run.
 *   - Retry explicito permitido via params._retry = true.
 *   - Max iterations explicito — nunca loop infinito.
 *   - Stop conditions: contract_satisfied | no_gaps | max_iterations | deadline | fatal_error.
 *   - FAST PATH preservado (KnownMissionDecomposer tem precedencia; DynamicWaveRunner
 *     so atua dentro do ADAPTIVE PATH).
 *   - OpenHands NAO e obrigatorio — o processo decide se inclui OpenHands ou nao.
 *   - Mecanica deterministica (wave → execute → reflect → wave). LLM permitido
 *     apenas para interpretar conteudo e decidir gaps (onde ja existe).
 */

import { ExecutionOrchestrator } from "@/lib/runtime-engine/ExecutionOrchestrator";
import type { ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";
import type { StepResult } from "@/lib/runtime-engine/RuntimeTypes";
import type {
  AdaptiveProcess,
  AdaptiveProcessContext,
  AdaptiveRunState,
  Reflection,
  ResearchStep,
} from "./AdaptiveProcess";
import type { ExecutionOutcome } from "../ExecutionTypes";
import { base44 } from "@/api/base44Client";

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_DEADLINE_MS = 120000;

// ── Deduplication ────────────────────────────────────────────────────────────

/**
 * Deterministic signature for a ResearchStep. Two steps with the same
 * signature are semantically identical (same connector, capability, params).
 * _retry is excluded so a retried step has the same signature as the original.
 */
function stepSignature(step: ResearchStep): string {
  const params = step.call.params ?? {};
  const sortedParams = Object.keys(params)
    .filter((k) => k !== "_retry")
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
  return `${step.call.connectorId}|${step.call.capability}|${sortedParams}`;
}

// ── Conversion ────────────────────────────────────────────────────────────────

function toExecutionStep(step: ResearchStep, index: number, wave: number): ExecutionStep {
  return Object.freeze({
    id: `wave-${wave}-step-${String(index + 1).padStart(2, "0")}`,
    connector: step.call.connectorId,
    capability: step.call.capability,
    parameters: Object.freeze({ ...step.call.params }),
    dependsOn: Object.freeze([] as string[]),
  });
}

function toOutcome(
  step: ResearchStep,
  result: StepResult | undefined,
  ctx: AdaptiveProcessContext,
): ExecutionOutcome {
  if (!result) {
    return Object.freeze({
      status: "failed" as const,
      connectorId: step.call.connectorId,
      capability: step.call.capability,
      output: null,
      message: "Step not dispatched (wave stopped on failure)",
      reversibility: "safe" as const,
      executionId: ctx.parentExecutionId,
      durationMs: null,
    });
  }
  return Object.freeze({
    status: result.status === "completed" ? "success" as const : "failed" as const,
    connectorId: step.call.connectorId,
    capability: step.call.capability,
    output: result.output,
    message: result.error,
    reversibility: "safe" as const,
    executionId: ctx.parentExecutionId,
    durationMs: result.durationMs,
  });
}

// ── Resource policy resolution (same pattern as ConversationRuntimeEngine) ──

async function resolveResourcePolicies(
  steps: readonly ExecutionStep[],
): Promise<Map<string, number>> {
  const policies = new Map<string, number>();
  const mcpPairs = new Map<string, { serverKey: string; tool: string }>();
  const serverCache = new Map<string, { tool_policy?: unknown } | null>();

  for (const s of steps) {
    if (s.connector === "mcp" && s.capability === "mcp.callTool") {
      const p = s.parameters as Record<string, unknown>;
      const name = typeof p.serverName === "string" ? p.serverName.trim() : "";
      const id = typeof p.serverId === "string" ? p.serverId.trim() : "";
      const server = name || id;
      const tool = typeof p.toolName === "string" ? p.toolName.trim() : "";
      if (!server || !tool) continue;
      const key = `mcp:${server}:${tool}`;
      if (!policies.has(key) && !mcpPairs.has(key)) {
        mcpPairs.set(key, { serverKey: server, tool });
      }
    }
  }

  for (const [, { serverKey, tool }] of mcpPairs) {
    let record = serverCache.get(serverKey);
    if (record === undefined) {
      try {
        const matches = await base44.entities.MCPServerConfig.filter({ name: serverKey });
        record = (matches[0] as { tool_policy?: unknown } | undefined) ?? null;
      } catch {
        record = null;
      }
      serverCache.set(serverKey, record);
    }
    const raw = record?.tool_policy;
    if (!raw) continue;
    const policyObj =
      typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          })()
        : raw;
    if (!policyObj || typeof policyObj !== "object") continue;
    const entry = (policyObj as Record<string, unknown>)[tool];
    const mc = (entry as { maxConcurrent?: unknown })?.maxConcurrent;
    if (typeof mc === "number" && Number.isFinite(mc) && Number.isInteger(mc) && mc > 0) {
      policies.set(`mcp:${serverKey}:${tool}`, mc);
    }
  }

  return policies;
}

// ── DynamicWaveRunner ────────────────────────────────────────────────────────

export interface DynamicWaveRunnerOptions {
  readonly maxIterations?: number;
  readonly deadlineMs?: number;
}

export interface WaveExecutionTrace {
  readonly wave: number;
  readonly stepCount: number;
  readonly dedupSkipped: number;
  readonly statuses: readonly string[];
}

export class DynamicWaveRunner {
  /**
   * Orquestra o loop dinamico: plan → wave → reflect → planNextWave → wave → ...
   * Cada wave e executada pelo ExecutionOrchestrator (resource-aware concurrency
   * preservada). Steps da wave N+1 nascem do output real da wave N.
   */
  async run(
    process: AdaptiveProcess,
    ctx: AdaptiveProcessContext,
    options?: DynamicWaveRunnerOptions,
  ): Promise<ExecutionOutcome> {
    const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const deadlineMs = options?.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const deadlineAt = Date.now() + deadlineMs;
    const orchestrator = new ExecutionOrchestrator();

    const completedSteps: { step: ResearchStep; result: ExecutionOutcome }[] = [];
    const executedSignatures = new Set<string>();
    let allSteps: ResearchStep[] = [];
    let allResults: ExecutionOutcome[] = [];
    let reflection: Reflection = { byStep: new Map(), gaps: [], sufficiency: 0 };
    let iterations = 0;
    let stoppedReason = "max_iterations";
    const waveTraces: WaveExecutionTrace[] = [];
    let waveCount = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      iterations = iter + 1;
      if (Date.now() > deadlineAt) {
        stoppedReason = "deadline";
        break;
      }

      // ── Generate wave ──────────────────────────────────────────────────
      let waveSteps: readonly ResearchStep[];
      if (iter === 0) {
        waveSteps = await process.plan(ctx);
      } else {
        const state: AdaptiveRunState = {
          iteration: iter,
          completedSteps: [...completedSteps],
          gaps: reflection.gaps,
          reflection,
        };
        waveSteps = process.planNextWave
          ? await process.planNextWave(state, ctx)
          : await process.plan(ctx);
      }

      if (waveSteps.length === 0) {
        stoppedReason = "no_steps";
        break;
      }

      // ── Deduplicate ────────────────────────────────────────────────────
      const deduped: ResearchStep[] = [];
      let dedupSkipped = 0;
      for (const s of waveSteps) {
        const sig = stepSignature(s);
        const isRetry = s.call.params?._retry === true;
        if (!isRetry && executedSignatures.has(sig)) {
          dedupSkipped++;
          continue;
        }
        deduped.push(s);
        executedSignatures.add(sig);
      }

      if (deduped.length === 0) {
        stoppedReason = "all_deduplicated";
        break;
      }

      // ── Convert to ExecutionSteps ─────────────────────────────────────
      waveCount++;
      const execSteps = deduped.map((s, i) => toExecutionStep(s, i, waveCount));

      // ── Resolve resource policies (MCP tool_policy) ───────────────────
      const resourcePolicies = await resolveResourcePolicies(execSteps);

      // ── Dispatch function: ExecutionStep → ctx.dispatch ──────────────
      const stepMap = new Map<string, ResearchStep>();
      execSteps.forEach((es, i) => stepMap.set(es.id, deduped[i]));

      const dispatchStep = async (
        step: ExecutionStep,
        _semaphoreWaitMs?: number,
      ): Promise<StepResult> => {
        const t0 = Date.now();
        try {
          const outcome = await ctx.dispatch({
            connectorId: step.connector,
            capability: step.capability,
            params: step.parameters as Record<string, unknown>,
          });
          return Object.freeze({
            stepId: step.id,
            connector: step.connector,
            capability: step.capability,
            status: outcome.status === "success" ? "completed" : "failed",
            output: outcome.output,
            error: outcome.message,
            startedAt: t0,
            finishedAt: Date.now(),
            durationMs: Date.now() - t0,
            attempt: 0,
          });
        } catch (e) {
          return Object.freeze({
            stepId: step.id,
            connector: step.connector,
            capability: step.capability,
            status: "failed" as const,
            output: null,
            error: String(e).slice(0, 300),
            startedAt: t0,
            finishedAt: Date.now(),
            durationMs: Date.now() - t0,
            attempt: 0,
          });
        }
      };

      // ── Execute wave through ExecutionOrchestrator ────────────────────
      const waveResult = await orchestrator.execute({
        steps: execSteps,
        dispatchStep,
        isCancelled: () => Date.now() > deadlineAt,
        deadlineAt,
        resourcePolicies: resourcePolicies.size > 0 ? resourcePolicies : undefined,
      });

      // ── Map results back to ExecutionOutcomes ─────────────────────────
      const waveOutcomes = deduped.map((s, i) =>
        toOutcome(s, waveResult.results.find((r) => r.stepId === execSteps[i].id), ctx),
      );

      // ── Record completed steps ────────────────────────────────────────
      deduped.forEach((s, i) => {
        completedSteps.push({ step: s, result: waveOutcomes[i] });
      });
      allSteps = allSteps.concat(deduped);
      allResults = allResults.concat(waveOutcomes);

      waveTraces.push({
        wave: waveCount,
        stepCount: deduped.length,
        dedupSkipped,
        statuses: waveOutcomes.map((o) => o.status),
      });

      // ── Reflect ──────────────────────────────────────────────────────
      reflection = await process.reflect(deduped, waveOutcomes, ctx);

      // ── Stop conditions ──────────────────────────────────────────────
      if (process.stop(reflection)) {
        stoppedReason = "contract_satisfied";
        break;
      }
      if (reflection.gaps.length === 0) {
        stoppedReason = "no_gaps";
        break;
      }
      // Fatal error: all steps in this wave failed AND no gaps to pursue
      // (if reflect produced gaps, the process may retry with different steps)
      const allFailed =
        waveOutcomes.length > 0 && waveOutcomes.every((r) => r.status === "failed");
      if (allFailed && reflection.gaps.length === 0) {
        stoppedReason = "fatal_error";
        break;
      }
    }

    // ── Synthesize ──────────────────────────────────────────────────────────
    const output = await process.synthesize(allSteps, allResults, reflection, ctx);
    const complete =
      stoppedReason === "contract_satisfied" || stoppedReason === "no_gaps";
    const partial = !complete;

    const finalOutput =
      typeof output === "object" && output !== null
        ? {
            ...(output as Record<string, unknown>),
            iterations,
            stoppedReason,
            gapsRemaining: reflection.gaps,
            partial,
            waveCount,
            waveTraces,
          }
        : output;

    return Object.freeze({
      status: complete ? ("success" as const) : ("failed" as const),
      connectorId: ctx.request.connectorId,
      capability: ctx.request.capability,
      output: finalOutput,
      message: partial
        ? `Mission ended with ${reflection.gaps.length} gap(s) after ${iterations} iteration(s): ${reflection.gaps.join("; ")}`
        : null,
      reversibility: "safe" as const,
      executionId: ctx.parentExecutionId,
      durationMs: null,
    });
  }
}