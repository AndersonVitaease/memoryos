// Goal Execution Queue v1.0
// Foundation v1.0 · Engineering First · Sprint Goal Execution Queue v1.0
// Responsabilidade: administrar a ordem de execucao de Goals.
// Nao executa Goals. Nao cria planos. Nao modifica Goals.

import type { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import type { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";
import type {
  ExecutionQueueEntry,
  QueueEntryStatus,
  QueueHealth,
  QueueLog,
  QueueMetrics,
  QueueStatistics,
} from "./GoalExecutionQueueTypes";

function uid(): string {
  return `geq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const PRIORITY_WEIGHT: Record<GoalPriority, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

const VALID_PRIORITIES: GoalPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export class GoalExecutionQueue {
  private _entries  = new Map<string, ExecutionQueueEntry>();
  private _queue:   ExecutionQueueEntry[] = [];   // sorted: priority DESC, enqueueTime ASC (FIFO)
  private _logs:    QueueLog[] = [];
  private _durations: number[] = [];
  private _waitTimes: number[] = [];
  private _metrics: QueueMetrics = {
    enqueueTotal: 0, dequeueTotal: 0, removeTotal: 0, peekTotal: 0,
    avgDurationMs: 0, maxQueueSeen: 0, minQueueSeen: Infinity,
  };

  constructor(
    private readonly registryService?: GoalRegistryService,
    private readonly scheduler?: GoalScheduler,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  enqueue(goalId: string, priority: GoalPriority = "MEDIUM"): { success: boolean; queueId?: string; error?: string } {
    const start   = Date.now();
    const execId  = uid();
    const queueId = uid();
    try {
      if (!goalId || typeof goalId !== "string") {
        return this._fail(execId, queueId, goalId, "enqueue", start, "goalId is required");
      }
      if (!VALID_PRIORITIES.includes(priority)) {
        return this._fail(execId, queueId, goalId, "enqueue", start, `Invalid priority: ${priority}`);
      }
      // Prevent duplicate active entries for same goalId
      const existing = this._findActiveByGoalId(goalId);
      if (existing) {
        return this._fail(execId, queueId, goalId, "enqueue", start, `Goal already queued: ${goalId}`);
      }
      // Optional: verify goal exists in registry
      if (this.registryService && !this.registryService.exists(goalId)) {
        return this._fail(execId, queueId, goalId, "enqueue", start, `Goal not found in registry: ${goalId}`);
      }

      const entry: ExecutionQueueEntry = Object.freeze({
        queueId, goalId,
        priority,
        enqueueTime: Date.now(),
        status:      "QUEUED" as QueueEntryStatus,
        attempts:    0,
      });

      this._entries.set(queueId, entry);
      this._insertSorted(entry);
      this._metrics.enqueueTotal++;
      this._trackQueue();
      this._log(execId, queueId, goalId, "enqueue", start, true);
      return { success: true, queueId };
    } catch (err) {
      return this._fail(execId, queueId, goalId, "enqueue", start, String(err));
    }
  }

  dequeue(): ExecutionQueueEntry | null {
    const start  = Date.now();
    const execId = uid();
    this._metrics.dequeueTotal++;
    try {
      const active = this._queue.filter(e => e.status === "QUEUED");
      if (active.length === 0) {
        this._log(execId, "none", "none", "dequeue", start, true);
        return null;
      }
      const top = active[0];
      // Mark as PROCESSING
      const updated = Object.freeze({ ...top, status: "PROCESSING" as QueueEntryStatus, attempts: top.attempts + 1 });
      this._entries.set(top.queueId, updated);
      this._dequeueFromQueue(top.queueId);
      this._waitTimes.push(Date.now() - top.enqueueTime);
      this._trackQueue();
      this._log(execId, top.queueId, top.goalId, "dequeue", start, true);
      return updated;
    } catch (err) {
      this._log(execId, "err", "err", "dequeue", start, false, String(err));
      return null;
    }
  }

  peek(): ExecutionQueueEntry | null {
    this._metrics.peekTotal++;
    const active = this._queue.filter(e => e.status === "QUEUED");
    return active[0] ?? null;
  }

  remove(queueId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const entry = this._entries.get(queueId);
      if (!entry) {
        return this._fail(execId, queueId, "unknown", "remove", start, `Entry not found: ${queueId}`);
      }
      if (entry.status === "REMOVED") {
        return this._fail(execId, queueId, entry.goalId, "remove", start, `Entry already removed`);
      }
      const updated = Object.freeze({ ...entry, status: "REMOVED" as QueueEntryStatus });
      this._entries.set(queueId, updated);
      this._dequeueFromQueue(queueId);
      this._metrics.removeTotal++;
      this._trackQueue();
      this._log(execId, queueId, entry.goalId, "remove", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, queueId, "unknown", "remove", start, String(err));
    }
  }

  exists(queueId: string): boolean {
    return this._entries.has(queueId);
  }

  list(filterStatus?: QueueEntryStatus): ExecutionQueueEntry[] {
    const all = [...this._entries.values()];
    return filterStatus ? all.filter(e => e.status === filterStatus) : all;
  }

  statistics(): QueueStatistics {
    const all     = [...this._entries.values()];
    const queued  = all.filter(e => e.status === "QUEUED").length;
    const avg     = this._waitTimes.length
      ? Math.round(this._waitTimes.reduce((a, b) => a + b, 0) / this._waitTimes.length) : 0;
    return Object.freeze({
      enqueued:  this._metrics.enqueueTotal,
      removed:   this._metrics.removeTotal,
      processed: this._metrics.dequeueTotal,
      failed:    all.filter(e => e.status === "FAILED").length,
      queueSize: queued,
      maxQueue:  this._metrics.maxQueueSeen,
      minQueue:  this._metrics.minQueueSeen === Infinity ? 0 : this._metrics.minQueueSeen,
      avgWaitMs: avg,
    });
  }

  health(): QueueHealth {
    try {
      const all = [...this._entries.values()];

      // queueIntegrity: every entry in _queue must exist in _entries
      const queueIntegrity = this._queue.every(e => this._entries.has(e.queueId));

      // priorityIntegrity: _queue is sorted higher priority first
      let priorityIntegrity = true;
      for (let i = 0; i < this._queue.length - 1; i++) {
        const a = PRIORITY_WEIGHT[this._queue[i].priority] ?? 0;
        const b = PRIORITY_WEIGHT[this._queue[i + 1].priority] ?? 0;
        if (a < b) { priorityIntegrity = false; break; }
      }

      // fifoIntegrity: same-priority entries are in enqueueTime order
      let fifoIntegrity = true;
      for (let i = 0; i < this._queue.length - 1; i++) {
        const a = this._queue[i];
        const b = this._queue[i + 1];
        if (
          PRIORITY_WEIGHT[a.priority] === PRIORITY_WEIGHT[b.priority] &&
          a.enqueueTime > b.enqueueTime
        ) { fifoIntegrity = false; break; }
      }

      const consistencyCheck = this._metrics.enqueueTotal >= this._metrics.removeTotal;

      const ok = queueIntegrity && priorityIntegrity && fifoIntegrity && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { queueIntegrity, priorityIntegrity, fifoIntegrity, consistencyCheck },
        details: `entries=${all.length} queue=${this._queue.length} enqueued=${this._metrics.enqueueTotal} removed=${this._metrics.removeTotal} dequeued=${this._metrics.dequeueTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { queueIntegrity: false, priorityIntegrity: false, fifoIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getMetrics(): QueueMetrics {
    return Object.freeze({
      ...this._metrics,
      minQueueSeen: this._metrics.minQueueSeen === Infinity ? 0 : this._metrics.minQueueSeen,
    });
  }

  getLogs(): QueueLog[] { return [...this._logs]; }

  clear(): void {
    this._entries.clear();
    this._queue     = [];
    this._logs      = [];
    this._durations = [];
    this._waitTimes = [];
    this._metrics   = {
      enqueueTotal: 0, dequeueTotal: 0, removeTotal: 0, peekTotal: 0,
      avgDurationMs: 0, maxQueueSeen: 0, minQueueSeen: Infinity,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _insertSorted(entry: ExecutionQueueEntry): void {
    this._queue.push(entry);
    // Sort: higher priority first; same priority = earlier enqueueTime first (FIFO)
    this._queue.sort((a, b) => {
      const pw = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
      if (pw !== 0) return pw;
      return a.enqueueTime - b.enqueueTime;
    });
  }

  private _dequeueFromQueue(queueId: string): void {
    this._queue = this._queue.filter(e => e.queueId !== queueId);
  }

  private _findActiveByGoalId(goalId: string): ExecutionQueueEntry | null {
    for (const e of this._entries.values()) {
      if (e.goalId === goalId && (e.status === "QUEUED" || e.status === "PROCESSING")) return e;
    }
    return null;
  }

  private _trackQueue(): void {
    const size = this._queue.length;
    if (size > this._metrics.maxQueueSeen) this._metrics.maxQueueSeen = size;
    if (size < this._metrics.minQueueSeen) this._metrics.minQueueSeen = size;
  }

  private _log(
    executionId: string, queueId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, queueId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, queueId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, queueId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}