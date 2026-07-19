/**
 * ConversationPlanningEngine.ts — Engineering Sprint E-02.2A
 * Goal → ExecutionPlan (normalized)
 *
 * SRP: Unica responsabilidade — receber um ConversationGoal e produzir
 *      um ExecutionPlan imutavel composto exclusivamente de Capabilities.
 *
 * O Planner conhece APENAS:
 *   - ConversationGoal  (contrato de entrada)
 *   - GoalCapabilityRegistry (mapeamento Goal → Capabilities)
 *   - ExecutionPlan     (contrato de saida)
 *
 * O Planner NAO conhece:
 *   - Runtime
 *   - validate_session / summarize / noop
 *   - OAuth / autenticacao
 *   - Retry / timeout
 *   - Connectors concretos (Gmail, Calendar, Drive)
 *   - LLM
 *   - Rede
 *
 * Toda a logica operacional (auth, retry, timeout, summarize, auditoria)
 * e responsabilidade exclusiva do Runtime (Sprint E-02.3).
 *
 * Observabilidade interna (in-process, sem telemetria externa):
 *   planning_started / planning_completed / planning_failed
 */

import type { ConversationGoal }    from "@/lib/goals/GoalTypes";
import type { GoalType }            from "@/lib/goals/GoalTypes";
import { GoalCapabilityRegistry }   from "./GoalCapabilityRegistry";
import { RuntimeDebug }             from "@/lib/debug/RuntimeDebug";
import {
  makePlanId,
  makeStepId,
} from "./ExecutionPlanTypes";
import type {
  ExecutionPlan,
  ExecutionStep,
  PlanningResult,
  PlanningEvent,
  PlanStatus,
} from "./ExecutionPlanTypes";

// ── Event listener type ───────────────────────────────────────────────────────

type PlanningEventListener = (event: PlanningEvent) => void;

// ── ConversationPlanningEngine ────────────────────────────────────────────────

export class ConversationPlanningEngine {
  private _listeners: PlanningEventListener[] = [];
  private _totalPlanned = 0;
  private _totalFailed  = 0;
  private _lastPlans:  ExecutionPlan[] = [];

  /**
   * Transforms a ConversationGoal into a structured, immutable ExecutionPlan.
   *
   * Each step in the plan represents a connector capability.
   * No infrastructure steps (validate_session, summarize, noop) are included —
   * those are injected by the Runtime during execution.
   *
   * Guarantees:
   * - Never throws
   * - Never makes network calls
   * - Never invokes connectors or runtime
   * - Deterministic for the same goal and registry state
   */
  plan(goal: ConversationGoal): PlanningResult {
    const t0     = Date.now();
    const planId = makePlanId();

    this._emit({ type: "planning_started", goalId: goal.id, planId, planningTime: 0, stepCount: 0, timestamp: Date.now() });

    try {
      if (!goal.valid) {
        return this._fail(planId, goal, "Goal is invalid", t0);
      }

      const descriptors = GoalCapabilityRegistry.resolve(goal.type as GoalType);

      // Unknown goalType (not registered) — treat as empty
      if (descriptors === null || descriptors.length === 0) {
        const plan = this._makePlan(planId, goal, [], "empty", t0);
        this._track(plan);
        this._totalPlanned++;
        this._emit({ type: "planning_completed", goalId: goal.id, planId, planningTime: Date.now() - t0, stepCount: 0, timestamp: Date.now() });
        return { plan, success: true, error: null, durationMs: Date.now() - t0 };
      }

      let idx = 0;
      const steps: ExecutionStep[] = descriptors.map((desc) => {
        idx++;
        const mergedParams = { ...desc.params, ...goal.parameters };
        // Observabilidade: emite evento no RuntimeDebug para conectores Drive
        if (desc.capability === "drive.downloadFile" || desc.connector === "google-drive") {
          RuntimeDebug.emit({
            executionId: goal.id ?? "unknown",
            connector:   "google-drive",
            source:      "Planner",
            event:       "drive step parameters",
            payload: {
              goalType:          goal.type,
              connector:         desc.connector,
              capability:        desc.capability,
              descParams:        desc.params,
              goalParameters:    goal.parameters,
              mergedParams,
              "fileName in merged":  mergedParams.fileName  ?? null,
              "fileId in merged":    mergedParams.fileId    ?? null,
              "query in merged":     mergedParams.query     ?? null,
            },
          });
        }
        return Object.freeze({
          id:         makeStepId(idx),
          connector:  desc.connector,
          capability: desc.capability,
          parameters: Object.freeze(mergedParams),
        });
      });

      const plan = this._makePlan(planId, goal, steps, "planned", t0);
      this._track(plan);
      this._totalPlanned++;
      this._emit({ type: "planning_completed", goalId: goal.id, planId, planningTime: Date.now() - t0, stepCount: steps.length, timestamp: Date.now() });
      return { plan, success: true, error: null, durationMs: Date.now() - t0 };

    } catch (err) {
      return this._fail(planId, goal, err instanceof Error ? err.message : "Unknown error", t0);
    }
  }

  // ── Observability ──────────────────────────────────────────────────────────

  onEvent(listener: PlanningEventListener): () => void {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter((l) => l !== listener); };
  }

  getMetrics() {
    return {
      totalPlanned: this._totalPlanned,
      totalFailed:  this._totalFailed,
      registrySize: GoalCapabilityRegistry.size,
      lastPlans:    [...this._lastPlans].reverse().slice(0, 20),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _makePlan(
    planId: string, goal: ConversationGoal,
    steps: ExecutionStep[], status: PlanStatus, t0: number,
  ): ExecutionPlan {
    return Object.freeze({
      id:         planId,
      goalId:     goal.id,
      goalType:   goal.type,
      status,
      steps:      Object.freeze([...steps]),
      createdAt:  Date.now(),
      durationMs: Date.now() - t0,
    });
  }

  private _fail(planId: string, goal: ConversationGoal, error: string, t0: number): PlanningResult {
    const plan = this._makePlan(planId, goal, [], "invalid_goal", t0);
    this._totalFailed++;
    this._emit({ type: "planning_failed", goalId: goal.id, planId, planningTime: Date.now() - t0, stepCount: 0, timestamp: Date.now() });
    return { plan, success: false, error, durationMs: Date.now() - t0 };
  }

  private _track(plan: ExecutionPlan): void {
    this._lastPlans.push(plan);
    if (this._lastPlans.length > 50) this._lastPlans.splice(0, this._lastPlans.length - 50);
  }

  private _emit(event: PlanningEvent): void {
    for (const l of this._listeners) {
      try { l(event); } catch { /* listener errors must not crash planning */ }
    }
  }
}

// ── App-wide singleton ────────────────────────────────────────────────────────

const _KEY = "__CONV_PLANNING_ENGINE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ConversationPlanningEngine();
}

export const conversationPlanningEngine: ConversationPlanningEngine = (
  globalThis as unknown as Record<string, ConversationPlanningEngine>
)[_KEY];