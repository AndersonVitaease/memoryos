/**
 * ConversationPlanningEngine.ts — Engineering Sprint E-02.2
 * Goal → ExecutionPlan
 *
 * SRP: Unica responsabilidade — receber um ConversationGoal e produzir
 *      um ExecutionPlan imutavel e estruturado.
 *
 * NAO executa steps.
 * NAO chama connectors (Gmail, Calendar, Drive, GitHub).
 * NAO chama Runtime.
 * NAO faz chamadas de rede.
 * NAO conhece OAuth.
 * NAO conhece LLM.
 *
 * Conhece apenas:
 *   - ConversationGoal (contrato de dados)
 *   - GoalPlanTemplates (mapeamento declarativo)
 *   - ExecutionPlanTypes (contratos de saida)
 *
 * Observabilidade interna:
 *   - planning_started
 *   - planning_completed
 *   - planning_failed
 * (eventos in-process, sem telemetria externa)
 */

import type { ConversationGoal }              from "@/lib/goals/GoalTypes";
import { getTemplate }                        from "./GoalPlanTemplates";
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

// ── Internal event bus (in-process, no external telemetry) ────────────────────

type PlanningEventListener = (event: PlanningEvent) => void;

// ── ConversationPlanningEngine ────────────────────────────────────────────────

export class ConversationPlanningEngine {
  private _listeners: PlanningEventListener[] = [];
  private _totalPlanned = 0;
  private _totalFailed  = 0;
  private _lastPlans: ExecutionPlan[] = [];

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Transforms a ConversationGoal into a structured, immutable ExecutionPlan.
   *
   * Guarantees:
   * - Never throws (returns plan with status "invalid_goal" on failure)
   * - Never makes network calls
   * - Never invokes connectors or runtime
   * - Deterministic for the same goal
   */
  plan(goal: ConversationGoal): PlanningResult {
    const t0     = Date.now();
    const planId = makePlanId();

    this._emit({
      type:         "planning_started",
      goalId:       goal.id,
      planId,
      planningTime: 0,
      stepCount:    0,
      timestamp:    Date.now(),
    });

    try {
      // Validate goal
      if (!goal.valid) {
        const plan = this._buildPlan(planId, goal, [], "invalid_goal", t0);
        this._totalFailed++;
        this._emit({
          type:         "planning_failed",
          goalId:       goal.id,
          planId,
          planningTime: Date.now() - t0,
          stepCount:    0,
          timestamp:    Date.now(),
        });
        return { plan, success: false, error: "Goal is invalid", durationMs: Date.now() - t0 };
      }

      // Look up template
      const template = getTemplate(goal.type as Parameters<typeof getTemplate>[0]);

      if (!template || template.steps.length === 0) {
        const plan = this._buildPlan(planId, goal, [], "empty", t0);
        this._totalPlanned++;
        this._trackPlan(plan);
        this._emit({
          type:         "planning_completed",
          goalId:       goal.id,
          planId,
          planningTime: Date.now() - t0,
          stepCount:    0,
          timestamp:    Date.now(),
        });
        return { plan, success: true, error: null, durationMs: Date.now() - t0 };
      }

      // Build steps from template + goal parameters
      let stepIdx = 0;
      const steps: ExecutionStep[] = template.steps.map((tmpl) => {
        stepIdx++;
        return Object.freeze({
          id:        makeStepId(stepIdx),
          type:      tmpl.type,
          connector: tmpl.connector,
          params:    Object.freeze({ ...tmpl.params, ...goal.parameters }),
        });
      });

      const plan = this._buildPlan(planId, goal, steps, "planned", t0);
      this._totalPlanned++;
      this._trackPlan(plan);
      this._emit({
        type:         "planning_completed",
        goalId:       goal.id,
        planId,
        planningTime: Date.now() - t0,
        stepCount:    steps.length,
        timestamp:    Date.now(),
      });

      return { plan, success: true, error: null, durationMs: Date.now() - t0 };

    } catch (err) {
      const plan = this._buildPlan(planId, goal, [], "invalid_goal", t0);
      this._totalFailed++;
      this._emit({
        type:         "planning_failed",
        goalId:       goal.id,
        planId,
        planningTime: Date.now() - t0,
        stepCount:    0,
        timestamp:    Date.now(),
      });
      return {
        plan,
        success:    false,
        error:      err instanceof Error ? err.message : "Unknown planning error",
        durationMs: Date.now() - t0,
      };
    }
  }

  // ── Observability ──────────────────────────────────────────────────────────

  onEvent(listener: PlanningEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  getMetrics() {
    return {
      totalPlanned:    this._totalPlanned,
      totalFailed:     this._totalFailed,
      lastPlans:       [...this._lastPlans].reverse().slice(0, 20),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _buildPlan(
    planId:    string,
    goal:      ConversationGoal,
    steps:     ExecutionStep[],
    status:    PlanStatus,
    t0:        number,
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

  private _trackPlan(plan: ExecutionPlan): void {
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