/**
 * CognitiveEventBus.ts — Sprint EF-410 (EventBus & Desacoplamento)
 *
 * Barramento de eventos cognitivos do MemoryOS.
 * Desacopla emissores (Pipeline, Planner) de consumidores (ObservationEngine,
 * StateViewEngine, métricas) sem criar uma segunda instância do RuntimeEventBus
 * (que é exclusivo de eventos de Conector).
 *
 * Eventos suportados:
 *   - planning_started / planning_completed / planning_failed  (Planner → Bus)
 *   - llm_response_generated                                   (Pipeline → Bus)
 *   - knowledge_observation_generated                          (ObsEngine → Bus)
 *   - state_view_built                                         (StateView → Bus)
 *
 * Garantias:
 *   - Singleton HMR-safe via globalThis
 *   - Handlers nunca propagam erros (isola falhas de observadores)
 *   - Fire-and-forget: emit() é síncrono, nunca bloqueia o caller
 *   - Imutabilidade: payloads são congelados na emissão
 */

// ── Tipos de eventos ───────────────────────────────────────────────────────────

export type CognitiveEventType =
  | 'planning_started'
  | 'planning_completed'
  | 'planning_failed'
  | 'llm_response_generated'
  | 'knowledge_observation_generated'
  | 'state_view_built';

export interface CognitiveEvent {
  readonly id:        string;
  readonly type:      CognitiveEventType;
  readonly sessionId: string;
  readonly executionId: string;
  readonly payload:   Readonly<Record<string, unknown>>;
  readonly timestamp: number;
  readonly seq:       number;
}

type CognitiveEventHandler = (event: CognitiveEvent) => void;

// ── CognitiveEventBus ─────────────────────────────────────────────────────────

class CognitiveEventBusClass {
  private readonly _handlers = new Map<CognitiveEventType, CognitiveEventHandler[]>();
  private readonly _globalHandlers: CognitiveEventHandler[] = [];
  private readonly _history: CognitiveEvent[] = [];
  private _seq   = 0;
  private _emits = 0;
  private _errs  = 0;

  // ── Subscription ────────────────────────────────────────────────────────────

  on(type: CognitiveEventType, handler: CognitiveEventHandler): () => void {
    const existing = this._handlers.get(type) ?? [];
    this._handlers.set(type, [...existing, handler]);
    return () => {
      const current = this._handlers.get(type) ?? [];
      this._handlers.set(type, current.filter(h => h !== handler));
    };
  }

  onAny(handler: CognitiveEventHandler): () => void {
    this._globalHandlers.push(handler);
    return () => {
      const idx = this._globalHandlers.indexOf(handler);
      if (idx >= 0) this._globalHandlers.splice(idx, 1);
    };
  }

  // ── Emission ─────────────────────────────────────────────────────────────────

  emit(
    type:        CognitiveEventType,
    sessionId:   string,
    executionId: string,
    payload:     Record<string, unknown> = {},
  ): CognitiveEvent {
    this._seq++;
    this._emits++;

    const event: CognitiveEvent = Object.freeze({
      id:          `cev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      sessionId,
      executionId,
      payload:     Object.freeze({ ...payload }),
      timestamp:   Date.now(),
      seq:         this._seq,
    });

    this._history.push(event);
    // Keep last 200 events in memory
    if (this._history.length > 200) this._history.splice(0, this._history.length - 200);

    const specific = this._handlers.get(type) ?? [];
    for (const h of [...specific, ...this._globalHandlers]) {
      try { h(event); }
      catch { this._errs++; /* handler errors must never affect the bus or caller */ }
    }

    return event;
  }

  // ── Inspection ──────────────────────────────────────────────────────────────

  recent(limit = 50): CognitiveEvent[] {
    return this._history.slice(-limit);
  }

  getByType(type: CognitiveEventType): CognitiveEvent[] {
    return this._history.filter(e => e.type === type);
  }

  statistics() {
    const byType: Record<string, number> = {};
    for (const e of this._history) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }
    return {
      emits:             this._emits,
      errors:            this._errs,
      historySize:       this._history.length,
      registeredTypes:   [...this._handlers.keys()],
      globalHandlers:    this._globalHandlers.length,
      byType,
    };
  }

  health() {
    return {
      status:     (this._errs > 10 ? 'DEGRADED' : 'HEALTHY') as 'HEALTHY' | 'DEGRADED',
      details:    `${this._emits} events emitted, ${this._errs} handler errors`,
      checkedAt:  new Date().toISOString(),
    };
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = '__COGNITIVE_EVENT_BUS__';
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new CognitiveEventBusClass();
}

export const cognitiveEventBus: CognitiveEventBusClass = (
  globalThis as unknown as Record<string, CognitiveEventBusClass>
)[_KEY];

export { CognitiveEventBusClass };