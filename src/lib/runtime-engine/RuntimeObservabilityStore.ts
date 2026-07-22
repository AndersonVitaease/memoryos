/**
 * RuntimeObservabilityStore.ts — EPIC-D (Runtime Observability)
 *
 * D-01: Modelo padronizado de evento de execução — cada etapa registra
 *       executionId, connectorId, capability, status, startedAt, finishedAt, durationMs.
 *
 * D-02: Modelo único de RuntimeObsEvent — elimina formatos divergentes.
 *
 * D-03: Correlação completa — todos os eventos compartilham executionId + stepId + connectorId.
 *
 * D-04: Histórico completo — nenhum evento é perdido entre Connector → Dispatcher → ExecutionResult.
 *
 * D-05: Métricas consolidadas — ExecutionSummary permite reconstruir tempo total,
 *       tempo por connector, tempo por etapa, status por etapa.
 *
 * SRP: apenas coleta e consulta de eventos. Sem lógica de execução.
 * Sem rede. Sem OAuth. Sem connectors.
 *
 * Singleton via globalThis — sobrevive a HMR.
 */

// ── D-01/D-02: Modelo canônico de evento ─────────────────────────────────────

export type ObsEventKind =
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "execution_cancelled"
  | "execution_timeout"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_timeout";

export interface RuntimeObsEvent {
  // D-03: Correlação completa
  readonly executionId:  string;
  readonly stepId:       string | null;
  readonly connectorId:  string | null;
  readonly capability:   string | null;
  // D-01: Campos obrigatórios por etapa
  readonly kind:         ObsEventKind;
  readonly status:       string;
  readonly startedAt:    number;
  readonly finishedAt:   number;
  readonly durationMs:   number;
  // Contexto auxiliar
  readonly error:        string | null;
  readonly planId:       string | null;
  readonly goalId:       string | null;
  readonly seq:          number;        // sequência global — garante ordenação
}

// ── D-05: Métricas consolidadas por execução ──────────────────────────────────

export interface StepMetric {
  readonly stepId:      string;
  readonly connectorId: string;
  readonly capability:  string;
  readonly status:      string;
  readonly startedAt:   number;
  readonly finishedAt:  number;
  readonly durationMs:  number;
  readonly error:       string | null;
}

export interface ExecutionSummary {
  readonly executionId:         string;
  readonly planId:              string | null;
  readonly goalId:              string | null;
  readonly finalStatus:         string;
  readonly startedAt:           number;
  readonly finishedAt:          number;
  readonly totalDurationMs:     number;
  readonly stepCount:           number;
  readonly steps:               readonly StepMetric[];
  // D-05: tempo por connector (somado de todos os steps do mesmo connector)
  readonly durationByConnector: Readonly<Record<string, number>>;
  readonly errors:              readonly string[];
  readonly eventCount:          number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const MAX_EVENTS     = 2000;
const MAX_EXECUTIONS = 200;

export class RuntimeObservabilityStore {
  private _events:     RuntimeObsEvent[]                    = [];
  private _byExec:     Map<string, RuntimeObsEvent[]>       = new Map();
  private _summaries:  Map<string, ExecutionSummary>        = new Map();
  private _seq        = 0;

  // ── D-01/D-02: Registrar evento padronizado ─────────────────────────────────

  record(event: Omit<RuntimeObsEvent, "seq">): void {
    const full: RuntimeObsEvent = Object.freeze({ ...event, seq: ++this._seq });

    // D-04: histórico completo — nunca descarta eventos de execuções ativas
    this._events.push(full);
    if (this._events.length > MAX_EVENTS) {
      // Remove os mais antigos apenas quando acima do limite
      this._events.splice(0, this._events.length - MAX_EVENTS);
    }

    // D-03: indexar por executionId para correlação rápida
    if (!this._byExec.has(full.executionId)) {
      this._byExec.set(full.executionId, []);
    }
    this._byExec.get(full.executionId)!.push(full);

    // Limitar número de execuções rastreadas (TTL por tamanho)
    if (this._byExec.size > MAX_EXECUTIONS) {
      const oldest = this._byExec.keys().next().value;
      if (oldest) this._byExec.delete(oldest);
    }
  }

  // ── D-05: Fechar execução e produzir summary ──────────────────────────────

  closeExecution(executionId: string, finalStatus: string): ExecutionSummary {
    const events = this._byExec.get(executionId) ?? [];

    const startEvent = events.find((e) => e.kind === "execution_started");
    const endEvent   = events.find((e) =>
      e.kind === "execution_completed" ||
      e.kind === "execution_failed"    ||
      e.kind === "execution_cancelled" ||
      e.kind === "execution_timeout",
    );

    const startedAt  = startEvent?.startedAt  ?? Date.now();
    const finishedAt = endEvent?.finishedAt    ?? Date.now();

    // Agregar steps a partir dos eventos de step_completed/failed/timeout
    const stepEvents = events.filter((e) =>
      e.kind === "step_completed" ||
      e.kind === "step_failed"    ||
      e.kind === "step_timeout",
    );

    const steps: StepMetric[] = stepEvents.map((e) => ({
      stepId:      e.stepId      ?? "unknown",
      connectorId: e.connectorId ?? "unknown",
      capability:  e.capability  ?? "unknown",
      status:      e.status,
      startedAt:   e.startedAt,
      finishedAt:  e.finishedAt,
      durationMs:  e.durationMs,
      error:       e.error,
    }));

    // D-05: tempo por connector
    const durationByConnector: Record<string, number> = {};
    for (const s of steps) {
      durationByConnector[s.connectorId] =
        (durationByConnector[s.connectorId] ?? 0) + s.durationMs;
    }

    const errors = steps
      .filter((s) => s.error !== null)
      .map((s) => `[${s.connectorId}.${s.capability}] ${s.error}`);

    const summary: ExecutionSummary = Object.freeze({
      executionId,
      planId:              startEvent?.planId  ?? null,
      goalId:              startEvent?.goalId  ?? null,
      finalStatus,
      startedAt,
      finishedAt,
      totalDurationMs:     finishedAt - startedAt,
      stepCount:           steps.length,
      steps:               Object.freeze(steps),
      durationByConnector: Object.freeze(durationByConnector),
      errors:              Object.freeze(errors),
      eventCount:          events.length,
    });

    this._summaries.set(executionId, summary);
    if (this._summaries.size > MAX_EXECUTIONS) {
      const oldest = this._summaries.keys().next().value;
      if (oldest) this._summaries.delete(oldest);
    }

    return summary;
  }

  // ── Consulta ──────────────────────────────────────────────────────────────

  /** D-03: todos os eventos de uma execução, em ordem de sequência */
  getEvents(executionId: string): readonly RuntimeObsEvent[] {
    return Object.freeze([...(this._byExec.get(executionId) ?? [])]);
  }

  /** D-05: summary consolidado de uma execução */
  getSummary(executionId: string): ExecutionSummary | null {
    return this._summaries.get(executionId) ?? null;
  }

  /** Últimas N execuções com summary */
  getRecentSummaries(limit = 20): readonly ExecutionSummary[] {
    const all = [...this._summaries.values()];
    return Object.freeze(all.slice(-limit).reverse());
  }

  /** Total de eventos registrados */
  totalEvents(): number {
    return this._events.length;
  }

  /** Total de execuções rastreadas */
  totalExecutions(): number {
    return this._byExec.size;
  }

  /** Snapshot global dos últimos N eventos para diagnóstico */
  recentEvents(limit = 100): readonly RuntimeObsEvent[] {
    return Object.freeze(this._events.slice(-limit));
  }
}

// ── Singleton via globalThis (HMR-safe) ──────────────────────────────────────

const _KEY = "__RUNTIME_OBS_STORE__";
const _g   = globalThis as Record<string, unknown>;
if (!_g[_KEY]) _g[_KEY] = new RuntimeObservabilityStore();

export const runtimeObsStore = _g[_KEY] as RuntimeObservabilityStore;