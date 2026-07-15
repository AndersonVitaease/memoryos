/**
 * ExecutionPlanTypes.ts — Engineering Sprint E-02.2
 * Shared types for the Planning Engine layer.
 *
 * SRP: apenas tipos e helpers de identificacao.
 * Sem logica. Sem rede. Sem connectors. Sem runtime.
 *
 * Usado por:
 *   - ConversationPlanningEngine
 *   - ConversationPipeline (step: planning)
 *   - Observability / Analytics
 *   - Sprint E-02.3 Runtime (consumidor do plano)
 */

// ── Step types ─────────────────────────────────────────────────────────────────

export type StepConnector =
  | "google"
  | "gmail"
  | "calendar"
  | "drive"
  | "memory"
  | null;

export type StepType =
  // Session lifecycle
  | "validate_session"
  // Gmail
  | "gmail.readInbox"
  | "gmail.searchMessages"
  | "gmail.readMessage"
  // Calendar
  | "calendar.listToday"
  | "calendar.listTomorrow"
  | "calendar.listWeek"
  | "calendar.createEvent"
  // Drive
  | "drive.searchFiles"
  | "drive.listRecent"
  | "drive.openDocument"
  // Memory
  | "memory.query"
  | "memory.summarize"
  // General
  | "summarize"
  | "noop";

export interface ExecutionStep {
  readonly id:        string;
  readonly type:      StepType;
  readonly connector: StepConnector;
  readonly params:    Readonly<Record<string, unknown>>;
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
}

// ── PlanningResult ─────────────────────────────────────────────────────────────

export interface PlanningResult {
  readonly plan:       ExecutionPlan;
  readonly success:    boolean;
  readonly error:      string | null;
  readonly durationMs: number;
}

// ── Observability events ───────────────────────────────────────────────────────

export interface PlanningEvent {
  readonly type:       "planning_started" | "planning_completed" | "planning_failed";
  readonly goalId:     string;
  readonly planId:     string;
  readonly planningTime: number;
  readonly stepCount:  number;
  readonly timestamp:  number;
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