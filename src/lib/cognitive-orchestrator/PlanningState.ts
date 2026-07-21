/**
 * PlanningState.ts — Sprint EF-45 · Dynamic Planning Engine
 *
 * SRP: representar o estado mutável de execução de um CognitivePlan.
 *
 * É o único lugar que guarda "o que aconteceu até agora".
 * O DynamicPlanningEngine lê esse estado para decidir se replanejar.
 *
 * Imutável externamente: mutações só via PlanningState.apply().
 */

import type { CognitivePlan, CognitiveTask } from "./COTypes";
import { makeCOId } from "./COTypes";

// ── Task execution status ─────────────────────────────────────────────────────

export type TaskExecutionStatus =
  | "pending"    // ainda não iniciada
  | "running"    // em execução
  | "completed"  // concluída com sucesso
  | "failed"     // falhou
  | "skipped"    // removida do plano
  | "retrying";  // em nova tentativa

export interface TaskExecutionRecord {
  readonly taskId:      string;
  readonly status:      TaskExecutionStatus;
  readonly startedAt:   number | null;
  readonly finishedAt:  number | null;
  readonly output:      unknown;
  readonly error:       string | null;
  readonly attempts:    number;
}

// ── New information signal ────────────────────────────────────────────────────
// Allows external callers to inject context that may trigger replanning

export interface NewInformation {
  readonly key:   string;    // e.g. "task_output", "external_fact"
  readonly value: unknown;
  readonly taskId?: string;  // associated task, if any
}

// ── Planning state ────────────────────────────────────────────────────────────

export interface PlanningStateSnapshot {
  readonly stateId:       string;
  readonly planId:        string;
  readonly goalId:        string;
  readonly taskRecords:   Readonly<Record<string, TaskExecutionRecord>>;
  readonly newInformation: readonly NewInformation[];
  readonly elapsedMs:     number;
  readonly startedAt:     number;
  readonly snapshotAt:    number;
}

// ── State builder + mutator ───────────────────────────────────────────────────

export class PlanningState {
  private readonly _planId:   string;
  private readonly _goalId:   string;
  private readonly _startedAt: number;
  private _records:            Map<string, TaskExecutionRecord>;
  private _newInfo:            NewInformation[];

  constructor(plan: CognitivePlan) {
    this._planId    = plan.id;
    this._goalId    = plan.goalId;
    this._startedAt = Date.now();
    this._newInfo   = [];

    // Initialize all tasks as pending
    this._records = new Map(
      plan.tasks.map(t => [t.id, {
        taskId:     t.id,
        status:     "pending" as TaskExecutionStatus,
        startedAt:  null,
        finishedAt: null,
        output:     null,
        error:      null,
        attempts:   0,
      }])
    );
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  markRunning(taskId: string): void {
    const r = this._records.get(taskId);
    if (!r) return;
    this._records.set(taskId, { ...r, status: "running", startedAt: Date.now(), attempts: r.attempts + 1 });
  }

  markCompleted(taskId: string, output: unknown): void {
    const r = this._records.get(taskId);
    if (!r) return;
    this._records.set(taskId, { ...r, status: "completed", finishedAt: Date.now(), output, error: null });
  }

  markFailed(taskId: string, error: string): void {
    const r = this._records.get(taskId);
    if (!r) return;
    this._records.set(taskId, { ...r, status: "failed", finishedAt: Date.now(), error });
  }

  markSkipped(taskId: string): void {
    const r = this._records.get(taskId);
    if (!r) return;
    this._records.set(taskId, { ...r, status: "skipped", finishedAt: Date.now() });
  }

  markRetrying(taskId: string): void {
    const r = this._records.get(taskId);
    if (!r) return;
    this._records.set(taskId, { ...r, status: "retrying" });
  }

  addInformation(info: NewInformation): void {
    this._newInfo.push(info);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  getRecord(taskId: string): TaskExecutionRecord | undefined {
    return this._records.get(taskId);
  }

  getStatus(taskId: string): TaskExecutionStatus | undefined {
    return this._records.get(taskId)?.status;
  }

  get completedIds(): string[] {
    return [...this._records.values()].filter(r => r.status === "completed").map(r => r.taskId);
  }

  get failedIds(): string[] {
    return [...this._records.values()].filter(r => r.status === "failed").map(r => r.taskId);
  }

  get pendingIds(): string[] {
    return [...this._records.values()].filter(r => r.status === "pending").map(r => r.taskId);
  }

  get skippedIds(): string[] {
    return [...this._records.values()].filter(r => r.status === "skipped").map(r => r.taskId);
  }

  get allCompleted(): boolean {
    return [...this._records.values()].every(r => r.status === "completed" || r.status === "skipped");
  }

  get hasFailures(): boolean {
    return this.failedIds.length > 0;
  }

  // ── Snapshot (immutable export) ───────────────────────────────────────────

  snapshot(): PlanningStateSnapshot {
    const records: Record<string, TaskExecutionRecord> = {};
    for (const [k, v] of this._records) records[k] = v;
    return Object.freeze({
      stateId:        makeCOId("state"),
      planId:         this._planId,
      goalId:         this._goalId,
      taskRecords:    Object.freeze(records),
      newInformation: Object.freeze([...this._newInfo]),
      elapsedMs:      Date.now() - this._startedAt,
      startedAt:      this._startedAt,
      snapshotAt:     Date.now(),
    });
  }
}