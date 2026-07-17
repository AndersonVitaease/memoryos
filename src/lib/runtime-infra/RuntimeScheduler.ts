// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeScheduler
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import { RuntimeLifecycle } from "./RuntimeLifecycle";
import type { LifecycleState } from "./RuntimeLifecycle";

export type SchedulerState = "QUEUED" | "READY" | "RUNNING" | "SUSPENDED" | "RESUMED" | "COMPLETED";

export interface ScheduledTask<T = unknown> {
  readonly id: string;
  readonly fn: () => Promise<T> | T;
  readonly scheduledAt: number;
  readonly priority: number;
}

export interface TaskRecord<T = unknown> {
  readonly task: ScheduledTask<T>;
  readonly lifecycle: RuntimeLifecycle;
  result?: T;
  error?: string;
  completedAt?: number;
}

export class RuntimeScheduler {
  private readonly _tasks: Map<string, TaskRecord<unknown>> = new Map();
  private readonly _clock: () => number;

  constructor(clock: () => number = () => Date.now()) { this._clock = clock; }

  schedule<T>(id: string, fn: () => Promise<T> | T, priority = 0): ScheduledTask<T> {
    const task: ScheduledTask<T> = Object.freeze({ id, fn, scheduledAt: this._clock(), priority });
    const lifecycle = new RuntimeLifecycle(this._clock);
    lifecycle.transition("QUEUED", "scheduled");
    this._tasks.set(id, { task, lifecycle } as TaskRecord<unknown>);
    return task;
  }

  async run<T>(id: string): Promise<T | undefined> {
    const rec = this._tasks.get(id) as TaskRecord<T> | undefined;
    if (!rec) throw new Error(`Task not found: ${id}`);
    rec.lifecycle.advanceTo("RUNNING");
    try {
      const result = await rec.task.fn();
      rec.lifecycle.tryTransition("COMPLETED", "ok");
      (rec as { result?: T }).result = result;
      (rec as { completedAt?: number }).completedAt = this._clock();
      return result;
    } catch (e) {
      rec.lifecycle.tryTransition("FAILED", String(e));
      (rec as { error?: string }).error = String(e);
      throw e;
    }
  }

  suspend(id: string): boolean {
    const rec = this._tasks.get(id);
    if (!rec) return false;
    return rec.lifecycle.tryTransition("SUSPENDED", "suspended");
  }

  resume(id: string): boolean {
    const rec = this._tasks.get(id);
    if (!rec) return false;
    if (!rec.lifecycle.tryTransition("RESUMED", "resumed")) return false;
    rec.lifecycle.tryTransition("RUNNING", "resumed→running");
    return true;
  }

  state(id: string): LifecycleState | null {
    return this._tasks.get(id)?.lifecycle.state() ?? null;
  }

  allTasks(): TaskRecord<unknown>[] {
    return [...this._tasks.values()];
  }

  pendingCount(): number {
    return [...this._tasks.values()].filter(r => !r.lifecycle.isTerminal()).length;
  }
}