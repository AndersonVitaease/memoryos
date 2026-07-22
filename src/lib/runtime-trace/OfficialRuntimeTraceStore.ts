/**
 * OfficialRuntimeTraceStore.ts — EF-60A
 *
 * Infraestrutura oficial de telemetria da Pipeline Cognitiva do MemoryOS.
 *
 * Registra exclusivamente fatos observados durante a execucao real.
 * Nao possui conhecimento arquitetural.
 * Nao presume, infere, nem codifica regras da pipeline.
 * Apenas registra.
 *
 * HMR-safe singleton via globalThis.
 */

// ── Tipos do Trace (somente fatos observados) ─────────────────────────────────

export interface StageTraceEvent {
  // Identidade
  readonly traceId:     string;  // ID unico deste evento
  readonly executionId: string;  // ID do ExecutionContext desta execucao
  readonly runId:       string;  // ID do run (cr_run_...)
  readonly runIndex:    number;  // sequencia global

  // Stage observado
  readonly stage:       string;  // nome do stage (observado — nao codificado)
  readonly position:    number;  // posicao de chegada (observada — nao mapeada)

  // Timestamps observados
  readonly startedAt:   number;  // Date.now() ao iniciar
  readonly finishedAt:  number;  // Date.now() ao terminar
  readonly durationMs:  number;  // finishedAt - startedAt

  // ExecutionContext observado
  readonly ctxBefore:   Record<string, unknown>;  // ctx antes do stage
  readonly ctxAfter:    Record<string, unknown>;  // ctx depois do stage
  readonly ctxDelta:    Record<string, unknown>;  // campos novos/alterados

  // Artefato observado
  readonly artifactId:  string;  // ID do artefato produzido (observado)

  // Resultado observado
  readonly status:      "ok" | "fallback" | "skipped";
  readonly summary:     string;
  readonly keyMetrics:  Record<string, number | string>;
}

export interface RuntimeTrace {
  readonly traceSessionId:  string;
  readonly startedAt:       number;
  readonly finishedAt:      number | null;
  readonly totalDurationMs: number | null;
  readonly runId:           string;
  readonly runIndex:        number;
  readonly executionId:     string;
  readonly goal:            string;
  readonly events:          StageTraceEvent[];
  readonly ctxFinal:        Record<string, unknown>;
  readonly complete:        boolean;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _seq = 0;
function makeTraceId(): string {
  return `trace_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── OfficialRuntimeTraceStoreImpl ─────────────────────────────────────────────

class OfficialRuntimeTraceStoreImpl {
  private _traces:    RuntimeTrace[] = [];
  private _listeners: Array<() => void> = [];

  subscribe(fn: () => void): () => void {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  private _notify(): void {
    this._listeners.forEach(fn => { try { fn(); } catch { /* silent */ } });
  }

  // ── beginTrace: chamado no inicio de cada execucao ────────────────────────

  beginTrace(params: {
    runId:       string;
    runIndex:    number;
    executionId: string;
    goal:        string;
  }): RuntimeTrace {
    const trace: RuntimeTrace = {
      traceSessionId:  makeTraceId(),
      startedAt:       Date.now(),
      finishedAt:      null,
      totalDurationMs: null,
      runId:           params.runId,
      runIndex:        params.runIndex,
      executionId:     params.executionId,
      goal:            params.goal,
      events:          [],
      ctxFinal:        {},
      complete:        false,
    };
    this._traces.push(trace);
    this._notify();
    return trace;
  }

  // ── recordStage: chamado apos cada stage — registra somente fatos ─────────

  recordStage(params: {
    trace:      RuntimeTrace;
    stage:      string;
    startedAt:  number;
    finishedAt: number;
    artifactId: string;
    ctxBefore:  Record<string, unknown>;
    ctxAfter:   Record<string, unknown>;
    status:     "ok" | "fallback" | "skipped";
    summary:    string;
    keyMetrics: Record<string, number | string>;
  }): void {
    // Derivar delta: apenas campos novos ou alterados
    const ctxDelta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params.ctxAfter)) {
      if (params.ctxBefore[k] === undefined) ctxDelta[k] = v;
    }

    // Posicao observada: contador de eventos ja registrados + 1
    const position = params.trace.events.length + 1;

    const event: StageTraceEvent = {
      traceId:     makeTraceId(),
      executionId: params.trace.executionId,
      runId:       params.trace.runId,
      runIndex:    params.trace.runIndex,
      stage:       params.stage,
      position,
      startedAt:   params.startedAt,
      finishedAt:  params.finishedAt,
      durationMs:  params.finishedAt - params.startedAt,
      ctxBefore:   { ...params.ctxBefore },
      ctxAfter:    { ...params.ctxAfter },
      ctxDelta,
      artifactId:  params.artifactId,
      status:      params.status,
      summary:     params.summary,
      keyMetrics:  { ...params.keyMetrics },
    };

    (params.trace as unknown as { events: StageTraceEvent[] }).events.push(event);
    this._notify();
  }

  // ── finalizeTrace: chamado ao terminar a execucao ────────────────────────

  finalizeTrace(params: {
    trace:    RuntimeTrace;
    ctxFinal: Record<string, unknown>;
  }): void {
    const t = params.trace as unknown as {
      finishedAt: number; totalDurationMs: number;
      ctxFinal: Record<string, unknown>; complete: boolean;
    };
    t.finishedAt      = Date.now();
    t.totalDurationMs = t.finishedAt - params.trace.startedAt;
    t.ctxFinal        = { ...params.ctxFinal };
    t.complete        = true;
    this._notify();
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getAll():  RuntimeTrace[]       { return [...this._traces]; }
  getLast(): RuntimeTrace | null  { return this._traces[this._traces.length - 1] ?? null; }
  clear():   void                 { this._traces = []; this._notify(); }
  export():  string               { return JSON.stringify(this._traces, null, 2); }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const _G = globalThis as typeof globalThis & { __EF60A_TRACE_STORE__?: OfficialRuntimeTraceStoreImpl };
if (!_G.__EF60A_TRACE_STORE__) _G.__EF60A_TRACE_STORE__ = new OfficialRuntimeTraceStoreImpl();
export const OfficialRuntimeTraceStore: OfficialRuntimeTraceStoreImpl = _G.__EF60A_TRACE_STORE__;