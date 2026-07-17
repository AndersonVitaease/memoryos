// ══════════════════════════════════════════════════════════════════════════════
// SPRINT C-03.6.4 — RuntimeBase
// MV > MPS > MAS > MDS v2.0
// ══════════════════════════════════════════════════════════════════════════════

import { DeterministicClock, SystemClock } from "./RuntimeClock";
import type { IClock } from "./RuntimeClockTypes";
import { SequentialProvider } from "./RuntimeExecutionIdProvider";
import type { IExecutionIdProvider } from "./RuntimeExecutionIdProvider";
import { RuntimeEventBus } from "./RuntimeEventBus";
import { RuntimeMetrics } from "./RuntimeMetrics";
import { RuntimeHealth } from "./RuntimeHealth";
import { RuntimeScheduler } from "./RuntimeScheduler";
import { createQueue } from "./RuntimeQueue";
import type { IQueue } from "./RuntimeQueueTypes";
import type { RuntimeEvent } from "./RuntimeEvent";
import type { RuntimeContext, RuntimeContextParams } from "./RuntimeContext";
import { createRuntimeContext } from "./RuntimeContext";
import type { RetryStrategy } from "./RuntimeRetryStrategy";
import { ExponentialRetry } from "./RuntimeRetryStrategy";
import type { TimeoutStrategy } from "./RuntimeTimeoutStrategy";
import { FixedTimeout } from "./RuntimeTimeoutStrategy";

export interface RuntimeBaseConfig {
  label: string;
  clock?: IClock;
  idProvider?: IExecutionIdProvider;
  retryStrategy?: RetryStrategy;
  timeoutStrategy?: TimeoutStrategy;
  maxHistoryEvents?: number;
}

export interface ExecutionRecord {
  readonly context: Readonly<RuntimeContext>;
  readonly state: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly durationMs: number | null;
  readonly retryCount: number;
  readonly error: string | null;
  readonly result: unknown;
  readonly explanation: string;
  readonly timeline: string[];
}

export abstract class RuntimeBase {
  protected readonly _label: string;
  protected readonly _clock: IClock;
  protected readonly _idProvider: IExecutionIdProvider;
  protected readonly _bus: RuntimeEventBus;
  protected readonly _metrics: RuntimeMetrics;
  protected readonly _health: RuntimeHealth;
  protected readonly _scheduler: RuntimeScheduler;
  protected readonly _queue: IQueue<RuntimeContextParams>;
  protected readonly _retryStrategy: RetryStrategy;
  protected readonly _timeoutStrategy: TimeoutStrategy;

  private readonly _executions: Map<string, ExecutionRecord> = new Map();

  constructor(cfg: RuntimeBaseConfig) {
    this._label        = cfg.label;
    this._clock        = cfg.clock ?? new SystemClock();
    this._idProvider   = cfg.idProvider ?? new SequentialProvider();
    this._retryStrategy = cfg.retryStrategy ?? new ExponentialRetry(3, 200);
    this._timeoutStrategy = cfg.timeoutStrategy ?? new FixedTimeout(10000);
    this._bus          = new RuntimeEventBus(cfg.maxHistoryEvents ?? 1000);
    this._metrics      = new RuntimeMetrics(60000, () => this._clock.now());
    this._health       = new RuntimeHealth(() => this._clock.now());
    this._scheduler    = new RuntimeScheduler(() => this._clock.now());
    this._queue        = createQueue<RuntimeContextParams>("FIFO");

    // wire bus → metrics
    this._bus.subscribe("EXECUTION_COMPLETED", () => {});
    this._bus.subscribe("EXECUTION_FAILED",    () => this._metrics.recordFailure());
    this._bus.subscribe("EXECUTION_CANCELLED", () => this._metrics.recordCancellation());
    this._bus.subscribe("EXECUTION_TIMEOUT",   () => this._metrics.recordTimeout());
    this._bus.subscribe("RETRY_SCHEDULED",     () => this._metrics.recordRetry());
  }

  // ── Subclass contracts ────────────────────────────────────────────────────
  protected abstract executeCore(ctx: Readonly<RuntimeContext>): Promise<unknown>;
  protected abstract label(): string;

  // ── Context factory ───────────────────────────────────────────────────────
  protected createContext(params: RuntimeContextParams): Readonly<RuntimeContext> {
    return createRuntimeContext(params, this._idProvider, this._clock, this._label);
  }

  // ── Event emission ────────────────────────────────────────────────────────
  protected emit(
    type: RuntimeEvent["type"],
    executionId: string,
    detail?: string,
    payload?: Record<string, unknown>
  ): void {
    this._bus.publish(Object.freeze({
      type,
      executionId,
      runtimeLabel: this._label,
      timestamp: this._clock.now(),
      detail,
      payload,
    }));
  }

  // ── Retry + Timeout wrapper ───────────────────────────────────────────────
  protected async runWithPolicy(
    ctx: Readonly<RuntimeContext>,
    executor: (c: Readonly<RuntimeContext>) => Promise<unknown>
  ): Promise<{ result: unknown; retryCount: number; error: string | null }> {
    const maxAttempts = this._retryStrategy.maxAttempts();
    let retryCount = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this._retryStrategy.delayMs(attempt - 1);
        if (delay > 0) await this._sleep(delay);
        this.emit("RETRY_SCHEDULED", ctx.executionId, `retry #${attempt}`);
        this._metrics.recordRetry();
        retryCount++;
      }

      try {
        const timeoutMs = this._timeoutStrategy.timeoutMs();
        const result = timeoutMs > 0
          ? await this._withTimeout(executor(ctx), timeoutMs, ctx.executionId)
          : await executor(ctx);
        return { result, retryCount, error: null };
      } catch (e: unknown) {
        const msg = String((e as Error).message ?? e);
        if (msg.startsWith("TIMEOUT:")) {
          this.emit("EXECUTION_TIMEOUT", ctx.executionId, msg);
          this._metrics.recordTimeout();
          return { result: null, retryCount, error: msg };
        }
        if (!this._retryStrategy.shouldRetry(attempt, msg)) {
          return { result: null, retryCount, error: msg };
        }
      }
    }
    return { result: null, retryCount, error: "Max retries exhausted" };
  }

  // ── Public execute ─────────────────────────────────────────────────────────
  async execute(params: RuntimeContextParams): Promise<ExecutionRecord> {
    const ctx = this.createContext(params);
    const timeline: string[] = [];
    const t0 = this._clock.now();

    this._metrics.recordExecution();
    this._health.incrementActive();
    this.emit("EXECUTION_CREATED", ctx.executionId);
    timeline.push(`[${this._clock.now()}] CREATED`);

    this.emit("EXECUTION_STARTED", ctx.executionId);
    this.emit("EXECUTION_RUNNING", ctx.executionId);
    timeline.push(`[${this._clock.now()}] RUNNING`);

    let state = "RUNNING";
    let completedAt: number | null = null;
    let durationMs: number | null = null;
    let result: unknown = null;
    let error: string | null = null;
    let retryCount = 0;

    const { result: res, retryCount: rc, error: err } = await this.runWithPolicy(ctx, c => this.executeCore(c));
    result = res; retryCount = rc; error = err;

    completedAt = this._clock.now();
    durationMs = completedAt - t0;
    this._health.decrementActive();

    if (error) {
      if (error.startsWith("TIMEOUT:")) {
        state = "TIMEOUT";
        this.emit("EXECUTION_TIMEOUT", ctx.executionId, error);
      } else {
        state = "FAILED";
        this.emit("EXECUTION_FAILED", ctx.executionId, error);
        this._metrics.recordFailure();
      }
    } else {
      state = "COMPLETED";
      this.emit("EXECUTION_COMPLETED", ctx.executionId, undefined, { durationMs });
      this._metrics.recordSuccess(durationMs);
    }

    timeline.push(`[${completedAt}] ${state}`);
    this._health.evaluate(
      this._metrics.snapshot().failures,
      this._metrics.snapshot().timeouts
    );

    const explanation = this._buildExplanation(ctx, state, retryCount, durationMs, error);
    const record: ExecutionRecord = Object.freeze({
      context: ctx, state, startedAt: t0, completedAt, durationMs, retryCount, error, result, explanation,
      timeline: Object.freeze(timeline) as unknown as string[],
    });
    this._executions.set(ctx.executionId, record);
    return record;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  getRecord(id: string): ExecutionRecord | null { return this._executions.get(id) ?? null; }
  allRecords(): Readonly<ExecutionRecord[]> { return Object.freeze([...this._executions.values()]); }
  health(): ReturnType<RuntimeHealth["report"]> { return this._health.report(); }
  metrics(): ReturnType<RuntimeMetrics["snapshot"]> { return this._metrics.snapshot(); }
  bus(): RuntimeEventBus { return this._bus; }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private _sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private _withTimeout<T>(promise: Promise<T>, ms: number, id: string): Promise<T> {
    return new Promise((res, rej) => {
      const t = setTimeout(
        () => rej(new Error(`TIMEOUT: exceeded ${ms}ms for ${id}`)),
        ms
      );
      promise.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });
  }

  private _buildExplanation(
    ctx: Readonly<RuntimeContext>,
    state: string,
    retryCount: number,
    durationMs: number | null,
    error: string | null
  ): string {
    return [
      `Runtime:  ${this._label}`,
      `ExecId:   ${ctx.executionId}`,
      `State:    ${state}`,
      `Retries:  ${retryCount}`,
      `Duration: ${durationMs ?? "?"}ms`,
      `Retry:    ${this._retryStrategy.label()}`,
      `Timeout:  ${this._timeoutStrategy.label()}`,
      error ? `Error:    ${error}` : null,
    ].filter(Boolean).join("\n");
  }
}