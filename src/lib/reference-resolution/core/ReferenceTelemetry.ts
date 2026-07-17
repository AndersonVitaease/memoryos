/**
 * ReferenceTelemetry.ts — Sprint C-02.3
 * Evento de telemetria emitido apos toda resolucao.
 *
 * SRP: capturar metricas minimas para analise futura da qualidade do algoritmo.
 * Imutavel. Sem efeitos colaterais.
 *
 * Futuro: integrar com CognitiveObservabilityManager e EventBus.
 */

import type { ReferenceResolutionReason } from "./ReferenceResolutionReason";

export interface ReferenceResolvedEvent {
  /** Nome do evento — sempre "ReferenceResolved" */
  readonly event: "ReferenceResolved";
  /** Connector alvo da resolucao */
  readonly connector: string;
  /** Texto original da referencia */
  readonly referenceText: string;
  /** Duracao da resolucao em ms */
  readonly durationMs: number;
  /** Total de candidatos encontrados */
  readonly candidateCount: number;
  /** Score do melhor candidato (0 se nenhum) */
  readonly confidence: number;
  /** Razao da resolucao */
  readonly reason: ReferenceResolutionReason;
  /** Se o usuario precisa confirmar a selecao */
  readonly confirmationRequired: boolean;
  /** Timestamp Unix em ms */
  readonly timestamp: number;
}

// ── TelemetryCollector ─────────────────────────────────────────────────────────
// In-process collector. Sem persistencia. Sem rede.
// Permite inspecao local e futura integracao com EventBus.

class TelemetryCollectorClass {
  private _events: ReferenceResolvedEvent[] = [];

  emit(event: ReferenceResolvedEvent): void {
    this._events.push(Object.freeze(event));
  }

  /** Retorna todos os eventos coletados (copia imutavel) */
  getEvents(): readonly ReferenceResolvedEvent[] {
    return Object.freeze([...this._events]);
  }

  /** Retorna os ultimos N eventos */
  getLastN(n: number): readonly ReferenceResolvedEvent[] {
    return Object.freeze(this._events.slice(-n));
  }

  /** Limpa todos os eventos (use apenas em testes) */
  clear(): void {
    this._events = [];
  }

  get size(): number {
    return this._events.length;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__REF_TELEMETRY_COLLECTOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new TelemetryCollectorClass();
}

export const TelemetryCollector: TelemetryCollectorClass = (
  globalThis as unknown as Record<string, TelemetryCollectorClass>
)[_KEY];