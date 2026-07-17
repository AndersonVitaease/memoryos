/**
 * CapabilityRuntime.ts — Sprint C-03.6.3
 *
 * Única camada responsável pelo ciclo completo de execução de Capabilities.
 *
 * Responsabilidades:
 *   start | cancel | complete | fail | timeout | state | history
 *   Retry Policy | Timeout Policy | Telemetria | Explainability | Health
 *
 * Proibido:
 *   - Selecionar Capabilities
 *   - Executar Connectors
 *   - Interpretar Intent / Goal
 */

import type {
  CapabilityExecutionContext,
  ExecutionRecord,
  StartOptions,
  RetryPolicy,
  TimeoutPolicy,
  RuntimeHealth,
  RuntimeHealthStatus,
  ExecutionState,
  StateSnapshot,
} from "./CapabilityRuntimeTypes";
import {
  DEFAULT_RETRY_POLICY,
  DEFAULT_TIMEOUT_POLICY,
} from "./CapabilityRuntimeTypes";
import { CapabilityExecutionState }    from "./CapabilityExecutionState";
import { CapabilityRuntimeTelemetry }  from "./CapabilityRuntimeTelemetry";
import { createContext }               from "./CapabilityExecutionContext";

// ── Internal execution envelope ───────────────────────────────────────────────

interface Execution {
  ctx:         Readonly<CapabilityExecutionContext>;
  sm:          CapabilityExecutionState;
  retry:       Readonly<RetryPolicy>;
  timeout:     Readonly<TimeoutPolicy>;
  retryCount:  number;
  error:       string | null;
  result:      unknown;
  completedAt: number | null;
}

// ── CapabilityRuntime ─────────────────────────────────────────────────────────

export class CapabilityRuntime {
  private readonly _executions: Map<string, Execution> = new Map();
  private readonly _tel: CapabilityRuntimeTelemetry;
  private readonly _durations: number[] = [];

  private _completed = 0;
  private _failed    = 0;
  private _cancelled = 0;
  private _timedOut  = 0;
  private _retries   = 0;

  constructor(telemetry?: CapabilityRuntimeTelemetry) {
    this._tel = telemetry ?? new CapabilityRuntimeTelemetry();
  }

  // ── start() ────────────────────────────────────────────────────────────────

  async start(params: {
    capabilityId: string;
    goalId:       string;
    sessionId:    string;
    reason?:      string;
  }, opts: StartOptions = {}): Promise<ExecutionRecord> {

    const retryPolicy:   Readonly<RetryPolicy>   = Object.freeze({ ...DEFAULT_RETRY_POLICY,   ...(opts.retry   ?? {}) });
    const timeoutPolicy: Readonly<TimeoutPolicy> = Object.freeze({ ...DEFAULT_TIMEOUT_POLICY, ...(opts.timeout ?? {}) });

    const ctx = createContext(params);
    const sm  = new CapabilityExecutionState();

    const exec: Execution = {
      ctx, sm, retry: retryPolicy, timeout: timeoutPolicy,
      retryCount: 0, error: null, result: null, completedAt: null,
    };
    this._executions.set(ctx.executionId, exec);

    this._tel.emit({ type: "CapabilityExecutionCreated", executionId: ctx.executionId, capabilityId: ctx.capabilityId, timestamp: Date.now() });

    sm.advanceTo("RUNNING");
    this._tel.emit({ type: "CapabilityExecutionStarted", executionId: ctx.executionId, capabilityId: ctx.capabilityId, timestamp: Date.now() });
    this._tel.emit({ type: "CapabilityExecutionRunning", executionId: ctx.executionId, timestamp: Date.now() });

    await this._executeWithRetry(exec, opts.executor);

    return this._buildRecord(exec);
  }

  // ── cancel() ───────────────────────────────────────────────────────────────

  cancel(executionId: string): boolean {
    const exec = this._executions.get(executionId);
    if (!exec || exec.sm.isTerminal()) return false;
    try {
      exec.sm.transition("CANCELLED", "Cancelled by caller");
      exec.completedAt = Date.now();
      this._cancelled++;
      this._tel.emit({ type: "CapabilityExecutionCancelled", executionId, capabilityId: exec.ctx.capabilityId, timestamp: Date.now() });
      return true;
    } catch { return false; }
  }

  // ── complete() — manual (Framework callback) ──────────────────────────────

  complete(executionId: string, result: unknown = null): boolean {
    const exec = this._executions.get(executionId);
    if (!exec || exec.sm.isTerminal()) return false;
    try {
      exec.sm.transition("COMPLETED", "Completed successfully");
      exec.result      = result;
      exec.completedAt = Date.now();
      const ms = exec.completedAt - exec.ctx.startedAt;
      this._durations.push(ms);
      this._completed++;
      this._tel.emit({ type: "CapabilityExecutionCompleted", executionId, capabilityId: exec.ctx.capabilityId, durationMs: ms, timestamp: Date.now() });
      this._tel.recordDuration(ms);
      return true;
    } catch { return false; }
  }

  // ── fail() ─────────────────────────────────────────────────────────────────

  fail(executionId: string, error: string): boolean {
    const exec = this._executions.get(executionId);
    if (!exec || exec.sm.isTerminal()) return false;
    try {
      exec.sm.transition("FAILED", error);
      exec.error       = error;
      exec.completedAt = Date.now();
      this._failed++;
      this._tel.emit({ type: "CapabilityExecutionFailed", executionId, capabilityId: exec.ctx.capabilityId, detail: error, timestamp: Date.now() });
      return true;
    } catch { return false; }
  }

  // ── timeout() ──────────────────────────────────────────────────────────────

  timeout(executionId: string): boolean {
    const exec = this._executions.get(executionId);
    if (!exec || exec.sm.isTerminal()) return false;
    try {
      exec.sm.transition("TIMEOUT", `Timed out after ${exec.timeout.timeoutMs}ms`);
      exec.error       = `Execution timed out after ${exec.timeout.timeoutMs}ms`;
      exec.completedAt = Date.now();
      this._timedOut++;
      this._tel.emit({ type: "CapabilityExecutionTimeout", executionId, capabilityId: exec.ctx.capabilityId, detail: exec.error, timestamp: Date.now() });
      return true;
    } catch { return false; }
  }

  // ── state() ────────────────────────────────────────────────────────────────

  state(executionId: string): ExecutionState | null {
    return this._executions.get(executionId)?.sm.state() ?? null;
  }

  // ── history() ──────────────────────────────────────────────────────────────

  history(executionId: string): readonly StateSnapshot[] {
    return this._executions.get(executionId)?.sm.history() ?? [];
  }

  // ── record() ───────────────────────────────────────────────────────────────

  record(executionId: string): Readonly<ExecutionRecord> | null {
    const exec = this._executions.get(executionId);
    return exec ? this._buildRecord(exec) : null;
  }

  // ── allRecords() ───────────────────────────────────────────────────────────

  allRecords(): readonly Readonly<ExecutionRecord>[] {
    return Object.freeze([...this._executions.values()].map(e => this._buildRecord(e)));
  }

  // ── health() ───────────────────────────────────────────────────────────────

  health(): Readonly<RuntimeHealth> {
    const active = [...this._executions.values()].filter(e => !e.sm.isTerminal()).length;
    const avg    = this._durations.length > 0
      ? parseFloat((this._durations.reduce((a, b) => a + b, 0) / this._durations.length).toFixed(2))
      : 0;
    const status: RuntimeHealthStatus =
      this._failed === 0 && this._timedOut === 0 ? "READY"
      : this._failed + this._timedOut < 3         ? "DEGRADED"
      : "FAILED";
    return Object.freeze({
      status,
      totalExecutions:  this._executions.size,
      activeExecutions: active,
      completed:        this._completed,
      failed:           this._failed,
      cancelled:        this._cancelled,
      timedOut:         this._timedOut,
      totalRetries:     this._retries,
      avgDurationMs:    avg,
    });
  }

  // ── telemetry access ───────────────────────────────────────────────────────

  telemetry(): CapabilityRuntimeTelemetry { return this._tel; }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _executeWithRetry(
    exec: Execution,
    executor?: (ctx: Readonly<CapabilityExecutionContext>) => Promise<unknown>,
  ): Promise<void> {
    if (!executor) {
      const ms = Date.now() - exec.ctx.startedAt;
      this._durations.push(ms);
      this._completed++;
      exec.completedAt = Date.now();
      try { exec.sm.transition("COMPLETED", "Completed (Framework handoff)"); } catch { /* already terminal */ }
      this._tel.emit({ type: "CapabilityExecutionCompleted", executionId: exec.ctx.executionId, capabilityId: exec.ctx.capabilityId, durationMs: ms, timestamp: Date.now() });
      this._tel.recordDuration(ms);
      return;
    }

    const { maxRetries, retryDelayMs, exponentialBackoff } = exec.retry;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (exec.sm.isTerminal()) return;

      if (attempt > 0) {
        this._retries++;
        exec.retryCount = attempt;
        const delay = exponentialBackoff ? retryDelayMs * Math.pow(2, attempt - 1) : retryDelayMs;
        this._tel.emit({ type: "CapabilityRetryScheduled", executionId: exec.ctx.executionId, retryCount: attempt, detail: `Retry #${attempt} in ${delay}ms`, timestamp: Date.now() });
        await this._sleep(delay);
        if (exec.sm.isTerminal()) return;
      }

      try {
        const result = exec.timeout.timeoutMs > 0
          ? await this._withTimeout(executor(exec.ctx), exec.timeout.timeoutMs, exec.ctx.executionId)
          : await executor(exec.ctx);

        exec.result      = result;
        exec.completedAt = Date.now();
        const ms = exec.completedAt - exec.ctx.startedAt;
        this._durations.push(ms);
        this._completed++;
        try { exec.sm.transition("COMPLETED", `Completed on attempt ${attempt + 1}`); } catch { /* already terminal */ }
        this._tel.emit({ type: "CapabilityExecutionCompleted", executionId: exec.ctx.executionId, capabilityId: exec.ctx.capabilityId, durationMs: ms, timestamp: Date.now() });
        this._tel.recordDuration(ms);
        return;

      } catch (e) {
        const msg = (e as Error).message ?? String(e);

        if (msg.startsWith("TIMEOUT:")) {
          exec.error       = msg;
          exec.completedAt = Date.now();
          this._timedOut++;
          try { exec.sm.transition("TIMEOUT", msg); } catch { /* already terminal */ }
          this._tel.emit({ type: "CapabilityExecutionTimeout", executionId: exec.ctx.executionId, detail: msg, timestamp: Date.now() });
          return;
        }

        if (attempt === maxRetries) {
          exec.error       = msg;
          exec.completedAt = Date.now();
          this._failed++;
          try { exec.sm.transition("FAILED", msg); } catch { /* already terminal */ }
          this._tel.emit({ type: "CapabilityExecutionFailed", executionId: exec.ctx.executionId, capabilityId: exec.ctx.capabilityId, detail: msg, timestamp: Date.now() });
          return;
        }
      }
    }
  }

  private async _withTimeout<T>(promise: Promise<T>, ms: number, execId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`TIMEOUT: exceeded ${ms}ms for execution ${execId}`)), ms,
      );
      promise.then(
        v => { clearTimeout(timer); resolve(v); },
        e => { clearTimeout(timer); reject(e); },
      );
    });
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private _buildRecord(exec: Execution): Readonly<ExecutionRecord> {
    const now = Date.now();
    const dur = exec.completedAt ? exec.completedAt - exec.ctx.startedAt : now - exec.ctx.startedAt;

    const explanation = [
      `Capability: ${exec.ctx.capabilityId}`,
      `Goal:       ${exec.ctx.goalId}`,
      `Session:    ${exec.ctx.sessionId}`,
      `Reason:     ${exec.ctx.reason}`,
      `State:      ${exec.sm.state()}`,
      `Retries:    ${exec.retryCount}`,
      `Duration:   ${dur}ms`,
      exec.error  ? `Error:      ${exec.error}`  : null,
      exec.result ? `Result:     ${JSON.stringify(exec.result).slice(0, 120)}` : null,
      `Timeout policy: ${exec.timeout.timeoutMs}ms`,
      `Retry policy:   max=${exec.retry.maxRetries} delay=${exec.retry.retryDelayMs}ms exp=${exec.retry.exponentialBackoff}`,
    ].filter(Boolean).join("\n");

    return Object.freeze({
      context:     exec.ctx,
      state:       exec.sm.state(),
      history:     exec.sm.history(),
      startedAt:   exec.ctx.startedAt,
      completedAt: exec.completedAt,
      durationMs:  exec.completedAt ? dur : null,
      retryCount:  exec.retryCount,
      error:       exec.error,
      result:      exec.result,
      explanation,
    });
  }
}