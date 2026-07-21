/**
 * PlanningRevision.ts — Sprint EF-45 · Dynamic Planning Engine
 *
 * SRP: representar uma decisão de revisão tomada pelo DynamicPlanningEngine.
 *
 * Uma revisão é imutável e auditável.
 * O caller (DynamicPlanningEngine) cria revisões; o Planner as consome.
 *
 * Imutável — sem side effects.
 */

import type { CognitivePlan, CognitiveTask } from "./COTypes";
import { makeCOId } from "./COTypes";

// ── Tipos de revisão ──────────────────────────────────────────────────────────

export type RevisionKind =
  | "no_change"           // plano válido, continuar
  | "reorder"             // reordenar tarefas (nova oportunidade paralela)
  | "skip_task"           // remover tarefa desnecessária
  | "retry_task"          // tentar tarefa falha novamente
  | "replace_task"        // substituir tarefa falha por alternativa
  | "inject_task"         // inserir nova tarefa (nova informação)
  | "abort"               // interromper execução (sem caminho)
  | "full_replan";        // regerar plano do zero

export type RevisionTrigger =
  | "task_failed"
  | "task_completed_with_new_info"
  | "parallel_opportunity_detected"
  | "task_became_unnecessary"
  | "critical_path_blocked"
  | "stalled"
  | "new_information_injected"
  | "manual";

// ── Revisão ───────────────────────────────────────────────────────────────────

export interface PlanningRevision {
  readonly id:              string;
  readonly planId:          string;
  readonly kind:            RevisionKind;
  readonly trigger:         RevisionTrigger;
  readonly rationale:       string;        // human-readable explanation
  readonly affectedTaskIds: readonly string[];
  readonly revisedPlan:     CognitivePlan | null;  // null for no_change/abort
  readonly newTaskIds:      readonly string[];     // ids injected by this revision
  readonly removedTaskIds:  readonly string[];     // ids removed by this revision
  readonly createdAt:       string;
  readonly durationMs:      number;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function makeRevision(
  opts: Omit<PlanningRevision, "id" | "createdAt"> & { startedAt: number }
): PlanningRevision {
  return Object.freeze({
    id:              makeCOId("rev"),
    planId:          opts.planId,
    kind:            opts.kind,
    trigger:         opts.trigger,
    rationale:       opts.rationale,
    affectedTaskIds: Object.freeze([...opts.affectedTaskIds]),
    revisedPlan:     opts.revisedPlan,
    newTaskIds:      Object.freeze([...opts.newTaskIds]),
    removedTaskIds:  Object.freeze([...opts.removedTaskIds]),
    createdAt:       new Date().toISOString(),
    durationMs:      Date.now() - opts.startedAt,
  });
}

// ── Revision log ──────────────────────────────────────────────────────────────

export class RevisionLog {
  private _entries: PlanningRevision[] = [];

  append(rev: PlanningRevision): void {
    this._entries.push(rev);
  }

  get all(): readonly PlanningRevision[] {
    return Object.freeze([...this._entries]);
  }

  get count(): number {
    return this._entries.length;
  }

  get lastKind(): RevisionKind | null {
    return this._entries.length > 0 ? this._entries[this._entries.length - 1].kind : null;
  }

  hasTrigger(trigger: RevisionTrigger): boolean {
    return this._entries.some(r => r.trigger === trigger);
  }
}