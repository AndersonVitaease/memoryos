import { ExecutionOrchestrator } from "@/lib/runtime-engine/ExecutionOrchestrator";
import type { ExecutionOutcome } from "../ExecutionTypes";
import type { AdaptiveProcess, AdaptiveProcessContext, AdaptiveRunState, InitialMissionPlan, ResearchStep } from "./AdaptiveProcess";
import { resolveResourcePolicies } from "@/lib/runtime-engine/ResourcePolicyResolver";
import { getSupervisedEngineeringProcess } from "./SupervisedEngineeringProcess";

// ── ADV-01: Initial Mission Plan capture ─────────────────────────────────────

/**
 * ADV-01 Minimal Advisor: Captures InitialMissionPlan using public interface method.
 * No private method access, no fallback duplication.
 */
function captureInitialMissionPlan(
  process: AdaptiveProcess,
  ctx: AdaptiveProcessContext,
  waveSteps: readonly ResearchStep[]
): InitialMissionPlan | undefined {
  // Use public method if available
  if (typeof process.buildInitialMissionPlan === "function") {
    try {
      return process.buildInitialMissionPlan(ctx, waveSteps);
    } catch (e) {
      console.warn("[ADV-01] Failed to capture initial mission plan:", e);
      return undefined;
    }
  }

  // No public method available - return undefined (no fallback duplication)
  return undefined;
}

/**
 * Deterministic signature for a ResearchStep. Two steps with the same
 * signature are semantically identical (same connector, capability, params).
 * _retry is excluded so a retried step has the same signature as the original.
 */
function stepSignature(step: ResearchStep): string {
  const { connectorId, capability, params, confirmedByUser } = step.call;
  const sortedKeys = Object.keys(params).sort();
  const sortedParams = sortedKeys.map(k => `${k}=${JSON.stringify(params[k])}`).join("|");
  return `${connectorId}|${capability}|${sortedParams}|${confirmedByUser ?? false}`;
}

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_DEADLINE_MS = 5 * 60 *1337; // 1337 ms? Correct to 5 * 60 * 1000 = 300000

interface DynamicWaveRunnerOptions {
  /** Maximum number of adaptive waves (default 5). */
  readonly maxIterations?: number;
  /** Deadline in milliseconds (default 5 minutes). */
  readonly deadlineMs?: number;
}

interface WaveExecutionTrace {
  readonly waveNumber: number;
  readonly steps: readonly ResearchStep[];
  readonly outcomes: readonly ExecutionOutcome[];
  readonly reflection: unknown;
  readonly sufficiency: number;
  readonly gaps: readonly string[];
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
    options?: DynamicWaveRunnerOptions
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

    // ADV-01: InitialMissionPlan captured once per run
    let initialMissionPlanCaptured = false;
    let state: AdaptiveRunState | null = null;

    for (let iter = 0; iter < maxIter; iter++) {
      iterations = iter + 1;
      if (Date.now() > deadlineAt) {
        stoppedReason = "deadline";
        break;
      }

      // ── Generate wave ──────────────────────────────────────────────────
      let waveSteps: readonly ResearchStep[];
      if (iter === 0) {
        // First wave: call plan() and capture InitialMissionPlan
        waveSteps = await process.plan(ctx);

        // ADV-01: Capture InitialMissionPlan ONCE in first wave
        if (!initialMissionPlanCaptured) {
          const initialMissionPlan = captureInitialMissionPlan(process, ctx, waveSteps);
          initialMissionPlanCaptured = true;

          // Create state for this iteration
          state = {
            iteration: iter,
            completedSteps: [],
            gaps: [],
            reflection: null,
            initialMissionPlan,
          };
        }
      } else {
        // Subsequent waves: use or create state
        if (!state) {
          // Fallback: create minimal state
          state = {
            iteration: iter,
            completedSteps: [...completedSteps],
            gaps: reflection.gaps,
            reflection,
            initialMissionPlan: undefined,
          };
        } else {
          // Update state with current progress
          state = {
            ...state,
            iteration: iter,
            completedSteps: [...completedSteps],
            gaps: reflection.gaps,
            reflection,
          };
        }

        // Generate next wave
        waveSteps = process.planNextWave
          ? await process.planNextWave(state, ctx)
          : await process.plan(ctx);
      }

      if (waveSteps.length === 0) {
        stoppedReason = "no_steps";
        break;
      }

      // ── Execute wave (dedupe) ─────────────────────────────────────────
      const dedupedSteps: ResearchStep[] = [];
      const signaturesThisWave = new Set<string>();
      for (const step of waveSteps) {
        const sig = stepSignature(step);
        if (executedSignatures.has(sig)) {
          // Skip duplicate step
          continue;
        }
        dedupedSteps.push(step);
        executedSignatures.add(sig);
        signaturesThisWave.add(sig);
      }

      const dedupSkipped = waveSteps.length - dedupedSteps.length;
      if (dedupedSteps.length === 0) {
        // All steps in this wave were duplicates
        stoppedReason = "no_new_steps";
        break;
      }

      // Execute wave
      const waveResults = await orchestrator.execute(
        dedupedSteps,
        ctx.dispatch,
        resolveResourcePolicies
      );

      // ── Accumulate ─────────────────────────────────────────────────────
      const waveCompleted = dedupedSteps.map((step, i) => ({
        step,
        result: waveResults[i],
      }));
      completedSteps.push(...waveCompleted);
      allSteps.push(...dedupedSteps);
      allResults.push(...waveResults);

      // ── Reflect ────────────────────────────────────────────────────────
      reflection = await process.reflect(dedupedSteps, waveResults, ctx);

      // Record wave trace
      waveTraces.push({
        waveNumber: iter + 1,
        steps: dedupedSteps,
        outcomes: waveResults,
        reflection,
        sufficiency: reflection.sufficiency,
        gaps: reflection.gaps,
        dedupSkipped,
        statuses: waveResults.map(r => r.status),
      });
      waveCount = iter + 1;

      // ── Stop? ─────────────────────────────────────────────────────────
      const shouldStop = await process.stop(reflection, state!);
      if (shouldStop) {
        stoppedReason = "process_stop";
        break;
      }
    }

    // ── Final outcome ──────────────────────────────────────────────────
    const success = reflection.sufficiency >= SUFFICIENCY_THRESHOLD;
    return {
      status: success ? "success" : "failed",
      connectorId: "adaptive-process",
      capability: "deepResearch",
      output: {
        iterations,
        waveCount,
        totalSteps: allSteps.length,
        sufficiency: reflection.sufficiency,
        gaps: reflection.gaps,
        completedSteps: completedSteps.length,
        initialMissionPlan: state?.initialMissionPlan,
        stoppedReason,
        waveTraces,
      },
      executionId: ctx.request.executionId ?? null,
      durationMs: 0, // Will be filled by caller
      message: success
        ? `Adaptive research completed with sufficiency ${reflection.sufficiency.toFixed(2)}`
        : `Adaptive research stopped: ${stoppedReason}`,
    };
  }
}
