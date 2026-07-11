// Goal Runtime v0.1 — Goal Implementation
// Foundation v1.0 · Engineering First · Sprint Goal Runtime v0.1
// Responsabilidade: implementar o ciclo de vida de um unico Goal

import type { IGoal } from "./GoalContract";
import type {
  GoalContext,
  GoalLog,
  GoalMetadata,
  GoalResult,
  GoalStatus,
} from "./GoalTypes";

function uuid(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function execId(): string {
  return `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeResult(
  success: boolean,
  goalId: string,
  status: GoalStatus,
  start: number,
  logs: GoalLog[],
  error?: string,
): GoalResult {
  return Object.freeze({
    success,
    goalId,
    status,
    duration: Date.now() - start,
    error,
    logs: Object.freeze([...logs]),
  });
}

export class Goal implements IGoal {
  private _meta: GoalMetadata;
  private _context: GoalContext | null = null;
  private _logs: GoalLog[] = [];
  private _status: GoalStatus = "CREATED";

  constructor(meta: Omit<GoalMetadata, "goalId"> & { goalId?: string }) {
    this._meta = Object.freeze({
      ...meta,
      goalId: meta.goalId ?? uuid(),
    }) as GoalMetadata;
  }

  // ── IGoal ──────────────────────────────────────────────────────────────────

  metadata(): GoalMetadata {
    return this._meta;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this._meta.title || this._meta.title.trim().length === 0) {
      errors.push("title is required");
    }
    if (this._meta.title && this._meta.title.trim().length > 256) {
      errors.push("title exceeds 256 characters");
    }
    if (!this._meta.userId || this._meta.userId.trim().length === 0) {
      errors.push("userId is required");
    }
    if (!this._meta.projectId || this._meta.projectId.trim().length === 0) {
      errors.push("projectId is required");
    }
    if (!this._meta.sessionId || this._meta.sessionId.trim().length === 0) {
      errors.push("sessionId is required");
    }
    const validPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    if (!validPriorities.includes(this._meta.priority)) {
      errors.push(`priority must be one of ${validPriorities.join(", ")}`);
    }
    const validOrigins = ["USER", "SYSTEM", "AGENT", "PLANNER"];
    if (!validOrigins.includes(this._meta.origin)) {
      errors.push(`origin must be one of ${validOrigins.join(", ")}`);
    }
    return { valid: errors.length === 0, errors };
  }

  async initialize(context: GoalContext): Promise<GoalResult> {
    const start = Date.now();
    const opExecId = execId();

    if (this._status !== "CREATED") {
      const log = this._log(opExecId, "initialize", start, `Cannot initialize Goal in status ${this._status}`);
      return makeResult(false, this._meta.goalId, this._status, start, [log], `Cannot initialize Goal in status ${this._status}`);
    }

    const validation = this.validate();
    if (!validation.valid) {
      this._status = "FAILED";
      const log = this._log(opExecId, "initialize", start, `Validation failed: ${validation.errors.join("; ")}`);
      return makeResult(false, this._meta.goalId, "FAILED", start, [log], `Validation failed: ${validation.errors.join("; ")}`);
    }

    this._context = Object.freeze({ ...context, goalId: this._meta.goalId, status: "VALIDATED" }) as GoalContext;
    this._status = "VALIDATED";

    // Transition to ACTIVE
    this._context = Object.freeze({ ...this._context, status: "ACTIVE", updatedAt: Date.now() }) as GoalContext;
    this._status = "ACTIVE";

    const log = this._log(opExecId, "initialize", start);
    return makeResult(true, this._meta.goalId, "ACTIVE", start, [log]);
  }

  async update(
    fields: Partial<Pick<GoalMetadata, "title" | "description" | "priority" | "tags">>,
  ): Promise<GoalResult> {
    const start = Date.now();
    const opExecId = execId();

    if (this._status !== "ACTIVE" && this._status !== "VALIDATED") {
      const log = this._log(opExecId, "update", start, `Cannot update Goal in status ${this._status}`);
      return makeResult(false, this._meta.goalId, this._status, start, [log], `Cannot update Goal in status ${this._status}`);
    }

    this._meta = Object.freeze({ ...this._meta, ...fields }) as GoalMetadata;
    if (this._context) {
      this._context = Object.freeze({ ...this._context, updatedAt: Date.now() }) as GoalContext;
    }

    const log = this._log(opExecId, "update", start);
    return makeResult(true, this._meta.goalId, this._status, start, [log]);
  }

  async complete(reason?: string): Promise<GoalResult> {
    const start = Date.now();
    const opExecId = execId();

    if (this._status !== "ACTIVE") {
      const msg = `Cannot complete Goal in status ${this._status}`;
      const log = this._log(opExecId, "complete", start, msg);
      return makeResult(false, this._meta.goalId, this._status, start, [log], msg);
    }

    this._status = "COMPLETED";
    if (this._context) {
      this._context = Object.freeze({ ...this._context, status: "COMPLETED", updatedAt: Date.now() }) as GoalContext;
    }

    const log = this._log(opExecId, "complete", start, reason);
    return makeResult(true, this._meta.goalId, "COMPLETED", start, [log]);
  }

  async cancel(reason?: string): Promise<GoalResult> {
    const start = Date.now();
    const opExecId = execId();

    if (this._status === "COMPLETED" || this._status === "CANCELLED") {
      const msg = `Cannot cancel Goal in status ${this._status}`;
      const log = this._log(opExecId, "cancel", start, msg);
      return makeResult(false, this._meta.goalId, this._status, start, [log], msg);
    }

    this._status = "CANCELLED";
    if (this._context) {
      this._context = Object.freeze({ ...this._context, status: "CANCELLED", updatedAt: Date.now() }) as GoalContext;
    }

    const log = this._log(opExecId, "cancel", start, reason ?? "Cancelled by caller");
    return makeResult(true, this._meta.goalId, "CANCELLED", start, [log]);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  getStatus(): GoalStatus { return this._status; }
  getContext(): GoalContext | null { return this._context; }
  getAllLogs(): GoalLog[] { return [...this._logs]; }

  private _log(executionId: string, operation: string, start: number, error?: string): GoalLog {
    const end = Date.now();
    const log: GoalLog = Object.freeze({
      executionId,
      goalId: this._meta.goalId,
      status: this._status,
      operation,
      startTime: start,
      endTime: end,
      duration: end - start,
      error,
    });
    this._logs.push(log);
    return log;
  }
}