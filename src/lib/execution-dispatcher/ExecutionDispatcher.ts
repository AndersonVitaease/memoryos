// Execution Dispatcher v1.0
// Foundation v1.0 · Engineering First · Sprint Execution Dispatcher v1.0
// Responsabilidade UNICA: mover Goals liberados pelo Scheduler para a Execution Queue.
// Nao executa Goals. Nao cria planos. Nao modifica Goal, GoalContext nem GoalResult.

import type { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import type { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import type { GoalExecutionQueue } from "@/lib/goal-execution-queue/GoalExecutionQueue";
import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";
import type {
  DispatchEntry,
  DispatchHealth,
  DispatchLog,
  DispatchMetrics,
  DispatchStatistics,
  DispatchStatus,
} from "./ExecutionDispatcherTypes";

function uid(): string {
  return `disp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ExecutionDispatcher {
  private _entries  = new Map<string, DispatchEntry>();
  private _logs:      DispatchLog[] = [];
  private _durations: number[]      = [];
  private _dispatchTimes: number[]  = [];
  private _metrics: DispatchMetrics = {
    dispatchTotal: 0, cancelledTotal: 0, failedTotal: 0,
    avgDurationMs: 0, maxDispatchRate: 0, minDispatchRate: Infinity,
  };

  constructor(
    private readonly registryService?: GoalRegistryService,
    private readonly scheduler?: GoalScheduler,
    private readonly queue?: GoalExecutionQueue,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  dispatch(goalId: string): { success: boolean; dispatchId?: string; queueId?: string; error?: string } {
    const start      = Date.now();
    const execId     = uid();
    const dispatchId = uid();
    try {
      if (!goalId || typeof goalId !== "string") {
        return this._fail(execId, dispatchId, goalId, null, "dispatch", start, "goalId is required");
      }

      // Validate goal exists in registry
      if (this.registryService && !this.registryService.exists(goalId)) {
        return this._fail(execId, dispatchId, goalId, null, "dispatch", start, `Goal not found in registry: ${goalId}`);
      }

      // Prevent duplicate active dispatches for same goalId
      const existing = this._findActiveByGoalId(goalId);
      if (existing) {
        return this._fail(execId, dispatchId, goalId, null, "dispatch", start, `Goal already dispatched: ${goalId}`);
      }

      // Resolve scheduledAt from scheduler if available
      const scheduleEntry = this.scheduler
        ? this.scheduler.list().find(s => s.goalId === goalId && (s.status === "PENDING" || s.status === "RESCHEDULED"))
        : null;
      const scheduledAt = scheduleEntry?.scheduledAt ?? Date.now();

      // Resolve priority from registry or schedule
      let priority: GoalPriority = "MEDIUM";
      if (this.registryService) {
        const goal = this.registryService.find(goalId);
        if (goal) priority = goal.metadata().priority;
      } else if (scheduleEntry) {
        priority = scheduleEntry.priority;
      }

      // Enqueue into Execution Queue
      let queueId: string | null = null;
      if (this.queue) {
        const qr = this.queue.enqueue(goalId, priority);
        if (!qr.success) {
          return this._fail(execId, dispatchId, goalId, null, "dispatch", start, `Queue enqueue failed: ${qr.error}`);
        }
        queueId = qr.queueId ?? null;
      }

      const entry: DispatchEntry = Object.freeze({
        dispatchId,
        goalId,
        queueId,
        scheduledAt,
        dispatchTime: Date.now(),
        status:       "DISPATCHED" as DispatchStatus,
        attempts:     1,
      });

      this._entries.set(dispatchId, entry);
      this._metrics.dispatchTotal++;
      this._trackDispatchTime(Date.now() - start);
      this._log(execId, dispatchId, goalId, queueId, "dispatch", start, true);
      return { success: true, dispatchId, queueId: queueId ?? undefined };
    } catch (err) {
      return this._fail(execId, dispatchId, goalId, null, "dispatch", start, String(err));
    }
  }

  dispatchReadyGoals(): { dispatched: number; failed: number; results: Array<{ goalId: string; success: boolean; error?: string }> } {
    const results: Array<{ goalId: string; success: boolean; error?: string }> = [];
    let dispatched = 0;
    let failed     = 0;

    if (!this.scheduler) {
      return { dispatched: 0, failed: 0, results: [] };
    }

    // Collect all pending/rescheduled schedule entries
    const ready = this.scheduler.list().filter(
      s => s.status === "PENDING" || s.status === "RESCHEDULED",
    );

    for (const schedule of ready) {
      const r = this.dispatch(schedule.goalId);
      results.push({ goalId: schedule.goalId, success: r.success, error: r.error });
      if (r.success) dispatched++;
      else failed++;
    }

    return { dispatched, failed, results };
  }

  cancelDispatch(dispatchId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const entry = this._entries.get(dispatchId);
      if (!entry) {
        return this._fail(execId, dispatchId, "unknown", null, "cancel", start, `Dispatch not found: ${dispatchId}`);
      }
      if (entry.status === "CANCELLED" || entry.status === "FAILED") {
        return this._fail(execId, dispatchId, entry.goalId, entry.queueId, "cancel", start, `Cannot cancel dispatch in status ${entry.status}`);
      }
      const updated = Object.freeze({ ...entry, status: "CANCELLED" as DispatchStatus });
      this._entries.set(dispatchId, updated);
      this._metrics.cancelledTotal++;
      this._log(execId, dispatchId, entry.goalId, entry.queueId, "cancel", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, dispatchId, "unknown", null, "cancel", start, String(err));
    }
  }

  exists(dispatchId: string): boolean {
    return this._entries.has(dispatchId);
  }

  list(filterStatus?: DispatchStatus): DispatchEntry[] {
    const all = [...this._entries.values()];
    return filterStatus ? all.filter(e => e.status === filterStatus) : all;
  }

  statistics(): DispatchStatistics {
    const times  = this._dispatchTimes;
    const avg    = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const rate   = this._metrics.dispatchTotal;
    return Object.freeze({
      dispatchTotal:   this._metrics.dispatchTotal,
      cancelledTotal:  this._metrics.cancelledTotal,
      failedTotal:     this._metrics.failedTotal,
      queueDispatches: this._metrics.dispatchTotal,
      avgDispatchTime: avg,
      dispatchRate:    rate,
      maxDispatchRate: this._metrics.maxDispatchRate,
      minDispatchRate: this._metrics.minDispatchRate === Infinity ? 0 : this._metrics.minDispatchRate,
    });
  }

  health(): DispatchHealth {
    try {
      const all = [...this._entries.values()];

      // schedulerIntegrity: if scheduler provided, all dispatched goalIds must have a schedule
      let schedulerIntegrity = true;
      if (this.scheduler) {
        const scheduleGoals = new Set(this.scheduler.list().map(s => s.goalId));
        for (const e of all.filter(e => e.status === "DISPATCHED")) {
          if (!scheduleGoals.has(e.goalId)) { schedulerIntegrity = false; break; }
        }
      }

      // queueIntegrity: dispatched entries must have a queueId if queue is provided
      let queueIntegrity = true;
      if (this.queue) {
        for (const e of all.filter(e => e.status === "DISPATCHED")) {
          if (!e.queueId) { queueIntegrity = false; break; }
        }
      }

      // dispatchIntegrity: all entries have required fields
      const dispatchIntegrity = all.every(e => e.dispatchId && e.goalId && e.dispatchTime > 0);

      const consistencyCheck = this._metrics.dispatchTotal >= this._metrics.cancelledTotal;

      const ok = schedulerIntegrity && queueIntegrity && dispatchIntegrity && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { schedulerIntegrity, queueIntegrity, dispatchIntegrity, consistencyCheck },
        details: `entries=${all.length} dispatched=${this._metrics.dispatchTotal} cancelled=${this._metrics.cancelledTotal} failed=${this._metrics.failedTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { schedulerIntegrity: false, queueIntegrity: false, dispatchIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getLogs(): DispatchLog[] { return [...this._logs]; }

  getMetrics(): DispatchMetrics {
    return Object.freeze({
      ...this._metrics,
      minDispatchRate: this._metrics.minDispatchRate === Infinity ? 0 : this._metrics.minDispatchRate,
    });
  }

  clear(): void {
    this._entries.clear();
    this._logs      = [];
    this._durations = [];
    this._dispatchTimes = [];
    this._metrics = {
      dispatchTotal: 0, cancelledTotal: 0, failedTotal: 0,
      avgDurationMs: 0, maxDispatchRate: 0, minDispatchRate: Infinity,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _findActiveByGoalId(goalId: string): DispatchEntry | null {
    for (const e of this._entries.values()) {
      if (e.goalId === goalId && (e.status === "PENDING" || e.status === "DISPATCHED")) return e;
    }
    return null;
  }

  private _trackDispatchTime(ms: number): void {
    this._dispatchTimes.push(ms);
    this._durations.push(ms);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    const rate = this._metrics.dispatchTotal;
    if (rate > this._metrics.maxDispatchRate) this._metrics.maxDispatchRate = rate;
    if (rate < this._metrics.minDispatchRate) this._metrics.minDispatchRate = rate;
  }

  private _log(
    executionId: string, dispatchId: string, goalId: string, queueId: string | null,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    this._logs.push(Object.freeze({
      executionId, dispatchId, goalId, queueId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration: Date.now() - start, error,
    }));
  }

  private _fail(
    execId: string, dispatchId: string, goalId: string, queueId: string | null,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._metrics.failedTotal++;
    this._log(execId, dispatchId, goalId, queueId, operation, start, false, error);
    return { success: false, error };
  }
}