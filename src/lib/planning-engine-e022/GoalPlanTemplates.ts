/**
 * GoalPlanTemplates.ts — Engineering Sprint E-02.2
 * Template registry: GoalType → ordered ExecutionStep descriptors.
 *
 * SRP: apenas mapeamento declarativo de GoalType → template de steps.
 *      Sem logica de execucao. Sem connectors. Sem rede.
 *
 * Open/Closed: para adicionar suporte a um novo GoalType, apenas
 *              acrescente uma entrada em PLAN_TEMPLATES — nenhum outro
 *              arquivo precisa mudar.
 *
 * Planning Engine nao conhece:
 *   - Connectors concretos (Gmail, Calendar, Drive)
 *   - Runtime
 *   - Google OAuth
 *   - LLM
 * Conhece apenas GoalTypes e StepTypes (contratos de dados).
 */

import type { GoalType }    from "@/lib/goals/GoalTypes";
import type { StepType, StepConnector } from "./ExecutionPlanTypes";

export interface StepTemplate {
  readonly type:      StepType;
  readonly connector: StepConnector;
  /** Static params merged with goal parameters at plan construction time */
  readonly params:    Record<string, unknown>;
}

export interface PlanTemplate {
  readonly goalType: GoalType;
  readonly steps:    readonly StepTemplate[];
}

// ── Template Registry ─────────────────────────────────────────────────────────

const PLAN_TEMPLATES: readonly PlanTemplate[] = [

  // ── Gmail ──────────────────────────────────────────────────────────────────
  {
    goalType: "gmail.readInbox",
    steps: [
      { type: "validate_session", connector: "google",  params: {} },
      { type: "gmail.readInbox",  connector: "gmail",   params: {} },
      { type: "summarize",        connector: null,       params: {} },
    ],
  },
  {
    goalType: "gmail.searchMessages",
    steps: [
      { type: "validate_session",      connector: "google", params: {} },
      { type: "gmail.searchMessages",  connector: "gmail",  params: {} },
      { type: "summarize",             connector: null,      params: {} },
    ],
  },
  {
    goalType: "gmail.readMessage",
    steps: [
      { type: "validate_session",   connector: "google", params: {} },
      { type: "gmail.readMessage",  connector: "gmail",  params: {} },
      { type: "summarize",          connector: null,      params: {} },
    ],
  },

  // ── Calendar ───────────────────────────────────────────────────────────────
  {
    goalType: "calendar.listToday",
    steps: [
      { type: "validate_session",    connector: "google",   params: {} },
      { type: "calendar.listToday",  connector: "calendar", params: {} },
      { type: "summarize",           connector: null,        params: {} },
    ],
  },
  {
    goalType: "calendar.listTomorrow",
    steps: [
      { type: "validate_session",      connector: "google",   params: {} },
      { type: "calendar.listTomorrow", connector: "calendar", params: {} },
      { type: "summarize",             connector: null,        params: {} },
    ],
  },
  {
    goalType: "calendar.listWeek",
    steps: [
      { type: "validate_session",   connector: "google",   params: {} },
      { type: "calendar.listWeek",  connector: "calendar", params: {} },
      { type: "summarize",          connector: null,        params: {} },
    ],
  },
  {
    goalType: "calendar.createEvent",
    steps: [
      { type: "validate_session",    connector: "google",   params: {} },
      { type: "calendar.createEvent",connector: "calendar", params: {} },
      { type: "summarize",           connector: null,        params: {} },
    ],
  },

  // ── Drive ──────────────────────────────────────────────────────────────────
  {
    goalType: "drive.searchFiles",
    steps: [
      { type: "validate_session",  connector: "google", params: {} },
      { type: "drive.searchFiles", connector: "drive",  params: {} },
      { type: "summarize",         connector: null,      params: {} },
    ],
  },
  {
    goalType: "drive.listRecent",
    steps: [
      { type: "validate_session", connector: "google", params: {} },
      { type: "drive.listRecent", connector: "drive",  params: {} },
      { type: "summarize",        connector: null,      params: {} },
    ],
  },
  {
    goalType: "drive.openDocument",
    steps: [
      { type: "validate_session",  connector: "google", params: {} },
      { type: "drive.openDocument",connector: "drive",  params: {} },
      { type: "summarize",         connector: null,      params: {} },
    ],
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  {
    goalType: "memory.query",
    steps: [
      { type: "memory.query",  connector: "memory", params: {} },
      { type: "summarize",     connector: null,      params: {} },
    ],
  },
  {
    goalType: "memory.summarize",
    steps: [
      { type: "memory.summarize", connector: "memory", params: {} },
      { type: "summarize",        connector: null,      params: {} },
    ],
  },

  // ── General / Unknown ──────────────────────────────────────────────────────
  {
    goalType: "general.conversation",
    steps: [
      { type: "noop", connector: null, params: {} },
    ],
  },
  {
    goalType: "unknown",
    steps: [],
  },
];

// ── Lookup ────────────────────────────────────────────────────────────────────

const _templateMap = new Map<GoalType, PlanTemplate>(
  PLAN_TEMPLATES.map((t) => [t.goalType, t]),
);

export function getTemplate(goalType: GoalType): PlanTemplate | null {
  return _templateMap.get(goalType) ?? null;
}

export function listTemplates(): readonly PlanTemplate[] {
  return PLAN_TEMPLATES;
}