/**
 * EventPersistenceBridge.ts — Fase 1 da Arquitetura Event-Driven Timeline
 *
 * Escuta o CognitiveEventBus (onAny) e persiste cada evento cognitivo como
 * um registro de SystemEvent no banco. Fire-and-forget: erros de DB nunca
 * propagam (mesmo padrao de isolamento do CognitiveEventBus).
 *
 * Nao modifica emissores nem consumidores existentes — e puramente aditivo.
 * Se o DB falhar, o sistema continua funcionando (eventos seguem em memoria
 * no historico do proprio bus).
 *
 * Em Fase 2 sera estendido para escutar tambem o RuntimeEventBus.
 */

import { cognitiveEventBus } from "@/lib/cognitive-event-bus/CognitiveEventBus";
import type { CognitiveEvent } from "@/lib/cognitive-event-bus/CognitiveEventBus";
import { runtimeEventBus } from "@/runtime/connectors/RuntimeEventBus";
import type { RuntimeEvent, RuntimeEventType } from "@/runtime/connectors/RuntimeEventBus";
import { base44 } from "@/api/base44Client";

// ── Mapeamento de tipo de evento de conector → status SystemEvent ────────────
const RUNTIME_STATUS_MAP: Partial<Record<RuntimeEventType, string>> = {
  ConnectorExecutionStarted:   "running",
  ConnectorExecutionCompleted: "success",
  ConnectorExecutionFailed:    "failure",
  ConnectorRetry:               "running",
  ConnectorTimeout:             "failure",
  ConnectorRateLimited:         "failure",
  ConnectorHealthChanged:       "running",
  ConnectorRecovered:           "success",
  ConnectorRegistered:          "success",
  ConnectorLoaded:              "success",
  ConnectorInitialized:         "success",
  ConnectorConnected:           "success",
  ConnectorDisconnected:       "failure",
  ConnectorDeprecated:          "running",
  ConnectorShutdown:            "running",
};

class EventPersistenceBridgeClass {
  private _active = false;
  private _persisted = 0;
  private _failed = 0;

  /**
   * Inicia a escuta no CognitiveEventBus. Idempotente — chamar mais de uma
   * vez nao duplica handlers.
   */
  start(): void {
    if (this._active) return;
    this._active = true;
    // Fonte 1: CognitiveEventBus (planning, llm, knowledge, stateview)
    cognitiveEventBus.onAny((event) => {
      void this._persist(event);
    });
    // Fonte 2: RuntimeEventBus (connector lifecycle + execution)
    runtimeEventBus.onAny((event) => {
      void this._persistRuntime(event);
    });
    console.log("[EventPersistenceBridge] ativo — escutando CognitiveEventBus + RuntimeEventBus");
  }

  /**
   * Persiste um evento do RuntimeEventBus (conectores) como SystemEvent.
   * Mesmo padrao fire-and-forget do _persist cognitivo.
   */
  private async _persistRuntime(event: RuntimeEvent): Promise<void> {
    try {
      const status = RUNTIME_STATUS_MAP[event.type] ?? "success";
      await base44.entities.SystemEvent.create({
        conversationId: (event.payload?.sessionId as string) || "",
        correlationId:  event.id,
        type:           event.type,
        source:         "RuntimeEventBus",
        actor:          "system",
        status,
        payload:        { ...event.payload } as Record<string, unknown>,
        metadata:       {
          connectorId:     event.connectorId,
          sequenceNumber: event.sequenceNumber,
          eventId:        event.id,
          timestamp:      event.timestamp,
        },
      });
      this._persisted++;
    } catch (err) {
      this._failed++;
      console.warn("[EventPersistenceBridge] falha ao persistir evento de runtime:", err);
    }
  }

  /**
   * Persiste um evento cognitivo como SystemEvent.
   * Erros sao engolidos silenciosamente (log em warn apenas).
   */
  private async _persist(event: CognitiveEvent): Promise<void> {
    try {
      await base44.entities.SystemEvent.create({
        conversationId: event.sessionId || "",
        correlationId:  event.executionId || null,
        type:           event.type,
        source:         "CognitiveEventBus",
        actor:          "system",
        status:         "success",
        payload:        { ...event.payload } as Record<string, unknown>,
        metadata:       {
          seq:       event.seq,
          eventId:   event.id,
          timestamp: event.timestamp,
        },
      });
      this._persisted++;
    } catch (err) {
      this._failed++;
      // fire-and-forget — nunca lanca
      console.warn("[EventPersistenceBridge] falha ao persistir evento:", err);
    }
  }

  /**
   * Estatisticas para debug/telemetria.
   */
  stats() {
    return { active: this._active, persisted: this._persisted, failed: this._failed };
  }
}

// ── Singleton HMR-safe (mesmo padrao do CognitiveEventBus/KnowledgeRegistry) ──

const _KEY = "__EVENT_PERSISTENCE_BRIDGE__";
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g[_KEY]) {
  _g[_KEY] = new EventPersistenceBridgeClass();
  // Auto-inicializa no load do modulo — aderencia ao padrao fire-and-forget
  (_g[_KEY] as EventPersistenceBridgeClass).start();
}

export const eventPersistenceBridge = (
  _g[_KEY] as EventPersistenceBridgeClass
);

export { EventPersistenceBridgeClass };