// Goal Runtime v0.1 — Goal Runtime
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1
// Responsabilidade: administrar o ciclo de vida completo de Goals

import { Goal } from "./Goal";
import { GoalRegistry } from "./GoalRegistry";
import type {
  GoalContext,
  GoalLog,
  GoalMetadata,
  GoalMetrics,
  GoalResult,
  GoalStatus,
} from "./GoalTypes";

function uuid(): string {
  return `rt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildContext(
  meta: GoalMetadata,
  overrides?: Partial<GoalContext>,
): GoalContext {
  const now = Date.now();
  return Object.freeze({
    executionId:     uuid(),
    goalId:          meta.goalId,
    userId:          meta.userId,
    projectId:       meta.projectId,
    sessionId:       meta.sessionId,
    identityContext: overrides?.identityContext ?? {},
    createdAt:       now,
    updatedAt:       now,
    status:          "CREATED" as GoalStatus,
    priority:        meta.priority,
    origin:          meta.origin,
    ...overrides,
  });
}

export class GoalRuntime {
  private registry = new GoalRegistry();
  private _logs: GoalLog[] = [];
  private _metrics: GoalMetrics = {
    created: 0, active: 0, completed: 0,
    cancelled: 0, failed: 0, invalid: 0,
    avgDurationMs: 0, totalDurationMs: 0, executionCount: 0,
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  async create(
    meta: Omit<GoalMetadata, "goalId"> & { goalId?: string },
    contextOverrides?: Partial<GoalContext>,
  ): Promise<GoalResult> {
    const start = Date.now();
    try {
      const goal = new Goal(meta);
      const { goalId } = goal.metadata();

      // Prevent duplicate
      if (this.registry.has(goalId)) {
        return this._fail(goalId, start, `Duplicate goalId: ${goalId}`);
      }

      // Validate
      const v = goal.validate();
      if (!v.valid) {
        this._metrics.invalid++;
        return this._fail(goalId, start, `Validation failed: ${v.errors.join("; ")}`);
      }

      // Register
      const reg = this.registry.register(goal);
      if (!reg.success) {
        return this._fail(goalId, start, reg.error ?? "Registry error");
      }

      // Initialize (creates context + transitions to ACTIVE)
      const ctx = buildContext(goal.metadata(), contextOverrides);
      const result = await goal.initialize(ctx);
      this._collect(goal.getAllLogs());

      if (result.success) {
        this._metrics.created++;
        this._metrics.active++;
      } else {
        this._metrics.failed++;
      }

      this._trackDuration(Date.now() - start);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this._fail("unknown", start, msg);
    }
  }

  async update(
    goalId: string,
    fields: Partial<Pick<GoalMetadata, "title" | "description" | "priority" | "tags">>,
  ): Promise<GoalResult> {
    const start = Date.now();
    const goal = this.registry.find(goalId);
    if (!goal) return this._fail(goalId, start, `Goal not found: ${goalId}`);
    const result = await goal.update(fields);
    this._collect(goal.getAllLogs());
    this._trackDuration(Date.now() - start);
    return result;
  }

  async complete(goalId: string, reason?: string): Promise<GoalResult> {
    const start = Date.now();
    const goal = this.registry.find(goalId);
    if (!goal) return this._fail(goalId, start, `Goal not found: ${goalId}`);
    const result = await goal.complete(reason);
    this._collect(goal.getAllLogs());
    if (result.success) {
      this._metrics.active = Math.max(0, this._metrics.active - 1);
      this._metrics.completed++;
    }
    this._trackDuration(Date.now() - start);
    return result;
  }

  async cancel(goalId: string, reason?: string): Promise<GoalResult> {
    const start = Date.now();
    const goal = this.registry.find(goalId);
    if (!goal) return this._fail(goalId, start, `Goal not found: ${goalId}`);
    const result = await goal.cancel(reason);
    this._collect(goal.getAllLogs());
    if (result.success) {
      this._metrics.active = Math.max(0, this._metrics.active - 1);
      this._metrics.cancelled++;
    }
    this._trackDuration(Date.now() - start);
    return result;
  }

  get(goalId: string): Goal | null {
    return this.registry.find(goalId);
  }

  listAll() {
    return this.registry.listAll();
  }

  getMetrics(): GoalMetrics {
    return Object.freeze({ ...this._metrics });
  }

  getLogs(): GoalLog[] {
    return [...this._logs];
  }

  healthCheck(): { status: "SUCCESS" | "FAILED"; details: string } {
    try {
      const m = this.getMetrics();
      return {
        status: "SUCCESS",
        details: `registry=${this.registry.size()} created=${m.created} active=${m.active} completed=${m.completed} cancelled=${m.cancelled} failed=${m.failed}`,
      };
    } catch (err) {
      return { status: "FAILED", details: String(err) };
    }
  }

  reset(): void {
    this.registry.clear();
    this._logs = [];
    this._metrics = {
      created: 0, active: 0, completed: 0,
      cancelled: 0, failed: 0, invalid: 0,
      avgDurationMs: 0, totalDurationMs: 0, executionCount: 0,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _fail(goalId: string, start: number, error: string): GoalResult {
    const duration = Date.now() - start;
    const log: GoalLog = Object.freeze({
      executionId: uuid(),
      goalId,
      status: "FAILED" as GoalStatus,
      operation: "runtime_error",
      startTime: start,
      endTime: Date.now(),
      duration,
      error,
    });
    this._logs.push(log);
    return Object.freeze({ success: false, goalId, status: "FAILED" as GoalStatus, duration, error, logs: [log] });
  }

  private _collect(logs: GoalLog[]): void {
    for (const log of logs) {
      if (!this._logs.find(l => l.executionId === log.executionId && l.operation === log.operation)) {
        this._logs.push(log);
      }
    }
  }

  private _trackDuration(ms: number): void {
    this._metrics.executionCount++;
    this._metrics.totalDurationMs += ms;
    this._metrics.avgDurationMs = Math.round(this._metrics.totalDurationMs / this._metrics.executionCount);
  }
}