// Goal Scheduler v1.0
// Foundation v1.0 · Engineering First · Sprint Goal Scheduler v1.0
// Responsabilidade: administrar QUANDO um Goal sera executado.
// Nao executa Goals. Nao cria planos. Nao modifica Goals.

import type { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import type {
  GoalSchedule,
  ScheduleStatus,
  SchedulerHealth,
  SchedulerLog,
  SchedulerMetrics,
  SchedulerStatistics,
} from "./GoalSchedulerTypes";
import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";

function uid(): string {
  return `sch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const PRIORITY_WEIGHT: Record<GoalPriority, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

export class GoalScheduler {
  private _schedules  = new Map<string, GoalSchedule>();
  private _queue:     GoalSchedule[] = [];          // sorted by scheduledAt + priority
  private _logs:      SchedulerLog[] = [];
  private _metrics:   SchedulerMetrics = {
    createdTotal: 0, cancelledTotal: 0, dispatchedTotal: 0,
    avgDurationMs: 0, maxQueueSeen: 0, minQueueSeen: Infinity,
  };
  private _durations: number[] = [];

  constructor(private readonly registryService?: GoalRegistryService) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  schedule(
    goalId: string,
    scheduledAt: number,
    priority: GoalPriority = "MEDIUM",
  ): { success: boolean; scheduleId?: string; error?: string } {
    const start = Date.now();
    const execId = uid();
    const scheduleId = uid();

    try {
      // Validate goalId
      if (!goalId || typeof goalId !== "string") {
        return this._fail(execId, scheduleId, goalId, "schedule", start, "goalId is required");
      }

      // Validate scheduledAt
      if (typeof scheduledAt !== "number" || scheduledAt <= 0) {
        return this._fail(execId, scheduleId, goalId, "schedule", start, "scheduledAt must be a positive number");
      }

      // Optional: verify goal exists in registry service
      if (this.registryService && !this.registryService.exists(goalId)) {
        return this._fail(execId, scheduleId, goalId, "schedule", start, `Goal not found in registry: ${goalId}`);
      }

      // Prevent duplicate active schedules for the same goalId
      const existing = this._findActiveByGoalId(goalId);
      if (existing) {
        return this._fail(execId, scheduleId, goalId, "schedule", start, `Active schedule already exists for goalId: ${goalId}`);
      }

      const entry: GoalSchedule = Object.freeze({
        scheduleId,
        goalId,
        createdAt:   Date.now(),
        scheduledAt,
        status:      "PENDING" as ScheduleStatus,
        attempts:    0,
        priority,
      });

      this._schedules.set(scheduleId, entry);
      this._enqueue(entry);
      this._metrics.createdTotal++;
      this._trackQueue();
      this._log(execId, scheduleId, goalId, "schedule", start, true);
      return { success: true, scheduleId };
    } catch (err) {
      return this._fail(execId, scheduleId, goalId, "schedule", start, String(err));
    }
  }

  cancel(scheduleId: string): { success: boolean; error?: string } {
    const start = Date.now();
    const execId = uid();
    try {
      const entry = this._schedules.get(scheduleId);
      if (!entry) {
        return this._fail(execId, scheduleId, "unknown", "cancel", start, `Schedule not found: ${scheduleId}`);
      }
      if (entry.status !== "PENDING" && entry.status !== "RESCHEDULED") {
        return this._fail(execId, scheduleId, entry.goalId, "cancel", start, `Cannot cancel schedule in status ${entry.status}`);
      }
      const updated = Object.freeze({ ...entry, status: "CANCELLED" as ScheduleStatus });
      this._schedules.set(scheduleId, updated);
      this._dequeue(scheduleId);
      this._metrics.cancelledTotal++;
      this._trackQueue();
      this._log(execId, scheduleId, entry.goalId, "cancel", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, scheduleId, "unknown", "cancel", start, String(err));
    }
  }

  reschedule(scheduleId: string, newScheduledAt: number): { success: boolean; error?: string } {
    const start = Date.now();
    const execId = uid();
    try {
      if (typeof newScheduledAt !== "number" || newScheduledAt <= 0) {
        return this._fail(execId, scheduleId, "unknown", "reschedule", start, "newScheduledAt must be a positive number");
      }
      const entry = this._schedules.get(scheduleId);
      if (!entry) {
        return this._fail(execId, scheduleId, "unknown", "reschedule", start, `Schedule not found: ${scheduleId}`);
      }
      if (entry.status === "CANCELLED" || entry.status === "DISPATCHED") {
        return this._fail(execId, scheduleId, entry.goalId, "reschedule", start, `Cannot reschedule in status ${entry.status}`);
      }
      const updated = Object.freeze({
        ...entry,
        scheduledAt: newScheduledAt,
        status:      "RESCHEDULED" as ScheduleStatus,
        attempts:    entry.attempts + 1,
      });
      this._schedules.set(scheduleId, updated);
      this._dequeue(scheduleId);
      this._enqueue(updated);
      this._log(execId, scheduleId, entry.goalId, "reschedule", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, scheduleId, "unknown", "reschedule", start, String(err));
    }
  }

  next(): GoalSchedule | null {
    const active = this._queue.filter(s => s.status === "PENDING" || s.status === "RESCHEDULED");
    return active[0] ?? null;
  }

  list(filterStatus?: ScheduleStatus): GoalSchedule[] {
    const all = [...this._schedules.values()];
    return filterStatus ? all.filter(s => s.status === filterStatus) : all;
  }

  exists(scheduleId: string): boolean {
    return this._schedules.has(scheduleId);
  }

  statistics(): SchedulerStatistics {
    const all = [...this._schedules.values()];
    const queue = all.filter(s => s.status === "PENDING" || s.status === "RESCHEDULED");
    const waits = all
      .filter(s => s.status === "DISPATCHED")
      .map(s => s.scheduledAt - s.createdAt)
      .filter(w => w >= 0);
    const avg = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;
    return Object.freeze({
      scheduled:    this._metrics.createdTotal,
      cancelled:    this._metrics.cancelledTotal,
      rescheduled:  all.filter(s => s.attempts > 0).length,
      dispatched:   this._metrics.dispatchedTotal,
      queueSize:    queue.length,
      maxQueueSize: this._metrics.maxQueueSeen === 0 ? queue.length : this._metrics.maxQueueSeen,
      minQueueSize: this._metrics.minQueueSeen === Infinity ? 0 : this._metrics.minQueueSeen,
      avgWaitMs:    avg,
    });
  }

  health(): SchedulerHealth {
    try {
      const all = [...this._schedules.values()];
      const queueSize = this._queue.length;

      // queueIntegrity: every queue entry must exist in _schedules
      const queueIntegrity = this._queue.every(s => this._schedules.has(s.scheduleId));

      // registryIntegrity: if service provided, all goalIds must be registered
      let registryIntegrity = true;
      if (this.registryService) {
        registryIntegrity = all.every(s => this.registryService!.exists(s.goalId));
      }

      // scheduleIntegrity: all entries have required fields
      const scheduleIntegrity = all.every(s =>
        s.scheduleId && s.goalId && s.scheduledAt > 0 && s.createdAt > 0,
      );

      const consistencyCheck = this._metrics.createdTotal >= this._metrics.cancelledTotal;

      const ok = queueIntegrity && registryIntegrity && scheduleIntegrity && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { queueIntegrity, registryIntegrity, scheduleIntegrity, consistencyCheck },
        details: `total=${all.length} queue=${queueSize} created=${this._metrics.createdTotal} cancelled=${this._metrics.cancelledTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { queueIntegrity: false, registryIntegrity: false, scheduleIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getMetrics(): SchedulerMetrics {
    return Object.freeze({
      ...this._metrics,
      minQueueSeen: this._metrics.minQueueSeen === Infinity ? 0 : this._metrics.minQueueSeen,
    });
  }

  getLogs(): SchedulerLog[] { return [...this._logs]; }

  clear(): void {
    this._schedules.clear();
    this._queue = [];
    this._logs  = [];
    this._durations = [];
    this._metrics = {
      createdTotal: 0, cancelledTotal: 0, dispatchedTotal: 0,
      avgDurationMs: 0, maxQueueSeen: 0, minQueueSeen: Infinity,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _enqueue(entry: GoalSchedule): void {
    this._queue.push(entry);
    // Sort: earliest scheduledAt first; ties broken by priority (higher = first)
    this._queue.sort((a, b) => {
      const timeDiff = a.scheduledAt - b.scheduledAt;
      if (timeDiff !== 0) return timeDiff;
      return (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
    });
  }

  private _dequeue(scheduleId: string): void {
    this._queue = this._queue.filter(s => s.scheduleId !== scheduleId);
  }

  private _findActiveByGoalId(goalId: string): GoalSchedule | null {
    for (const s of this._schedules.values()) {
      if (s.goalId === goalId && (s.status === "PENDING" || s.status === "RESCHEDULED")) {
        return s;
      }
    }
    return null;
  }

  private _trackQueue(): void {
    const size = this._queue.length;
    if (size > this._metrics.maxQueueSeen) this._metrics.maxQueueSeen = size;
    if (size < this._metrics.minQueueSeen) this._metrics.minQueueSeen = size;
  }

  private _log(
    executionId: string, scheduleId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, scheduleId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, scheduleId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, scheduleId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}