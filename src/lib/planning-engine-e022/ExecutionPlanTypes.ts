/**
 * ExecutionPlanTypes.ts — Engineering Sprint E-02.2A
 * Canonical types for the Planning Engine.
 *
 * SRP: apenas contratos de dados. Sem logica. Sem rede. Sem connectors.
 *
 * Utilizado por:
 *   - ConversationPlanningEngine (produtor)
 *   - ConversationPipeline       (consumidor step: planning)
 *   - Runtime Engine             (Sprint E-02.3 — executor)
 *   - Observability / Analytics
 *
 * MODELO CANONICAL:
 *   ExecutionStep = { connector, capability, parameters }
 *
 *   O Runtime e o unico responsavel por adicionar:
 *     - validate_session
 *     - retry / timeout
 *     - summarize
 *     - observabilidade / auditoria
 */

// ── Connector identifier ───────────────────────────────────────────────────────
// String open-ended so future connectors need no type changes here.
export type ConnectorId = string;

// ── ExecutionMode — Sprint M1.12 ──────────────────────────────────────────────
// Controls whether the Runtime executes connectors or performs static analysis.
// Default: "live" — preserves all existing behavior when mode is absent.
export type ExecutionMode = "live" | "static_analysis";

// ── ExecutionStep ─────────────────────────────────────────────────────────────

export interface ExecutionStep {
  readonly id:         string;
  readonly connector:  ConnectorId;
  readonly capability: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  /**
   * Optional execution dependencies used by the ExecutionOrchestrator.
   * Omitted preserves legacy sequential semantics (the step depends on the
   * previous plan step). An explicit [] declares the step as independent.
   */
  readonly dependsOn?: readonly string[];
}

// ── ExecutionPlan ──────────────────────────────────────────────────────────────

export type PlanStatus = "planned" | "empty" | "invalid_goal";

export interface ExecutionPlan {
  readonly id:         string;
  readonly goalId:     string;
  readonly goalType:   string;
  readonly status:     PlanStatus;
  readonly steps:      readonly ExecutionStep[];
  readonly createdAt:  number;
  readonly durationMs: number;
  /** Sprint M1.12: execution mode. Defaults to "live" when absent. */
  readonly mode?:      ExecutionMode;
}

// ── PlanningResult ─────────────────────────────────────────────────────────────

export interface PlanningResult {
  readonly plan:       ExecutionPlan;
  readonly success:    boolean;
  readonly error:      string | null;
  readonly durationMs: number;
}

// ── Observability events (in-process only, no external telemetry) ─────────────

export interface PlanningEvent {
  readonly type:        "planning_started" | "planning_completed" | "planning_failed";
  readonly goalId:      string;
  readonly planId:      string;
  readonly planningTime: number;
  readonly stepCount:   number;
  readonly timestamp:   number;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _planSeq = 0;
let _stepSeq = 0;

export function makePlanId(): string {
  return `plan-${Date.now()}-${(++_planSeq).toString(36)}`;
}

export function makeStepId(n: number): string {
  return `step-${String(n).padStart(2, "0")}-${(++_stepSeq).toString(36)}`;
}