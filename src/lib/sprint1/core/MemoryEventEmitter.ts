/**
 * MemoryEventEmitter — Publicador de eventos do Working Memory
 * Foundation: MREM Cap.4, MRS Cap.5
 * Sprint: 1
 *
 * Publica eventos conforme catálogo oficial do MREM.
 * Desacoplado do EventBus real — aceita qualquer handler via injeção.
 */

import type { MemoryEvent, MemoryEventType } from "../types/MemoryEvent";
import type { IdentityContext } from "../types/IdentityContext";
import { MEMORY_EVENT_PRIORITY } from "../types/MemoryEvent";
import { generateId } from "../utils/uuid";

/** Tipo do handler de eventos injetado */
export type EventHandler = (event: MemoryEvent) => void;

export class MemoryEventEmitter {
  private readonly handlers: EventHandler[] = [];
  private readonly eventHistory: MemoryEvent[] = [];
  private readonly MAX_HISTORY = 1000;

  /**
   * Registra um handler para receber todos os eventos.
   * No ambiente real, este handler faz bridge para o EventBus.
   */
  onEvent(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Publica um evento para todos os handlers registrados.
   * O evento é armazenado em histórico local para observabilidade.
   */
  emit(params: {
    type: MemoryEventType;
    correlationId: string;
    ctx: IdentityContext;
    itemId?: string;
    itemKey?: string;
    details?: Record<string, string | number | boolean>;
  }): MemoryEvent {
    const event: MemoryEvent = Object.freeze({
      eventId:       generateId(),
      type:          params.type,
      priority:      MEMORY_EVENT_PRIORITY[params.type],
      timestamp:     Date.now(),
      correlationId: params.correlationId,
      userId:        params.ctx.userId,
      sessionId:     params.ctx.sessionId,
      itemId:        params.itemId,
      itemKey:       params.itemKey,
      details:       params.details,
    });

    // Persist in bounded history
    if (this.eventHistory.length >= this.MAX_HISTORY) {
      this.eventHistory.shift();
    }
    this.eventHistory.push(event);

    // Deliver to all handlers
    for (const handler of this.handlers) {
      try { handler(event); } catch { /* never let handler crash the engine */ }
    }

    return event;
  }

  /** Retorna histórico de eventos filtrado por tipo */
  getHistory(type?: MemoryEventType): MemoryEvent[] {
    if (!type) return [...this.eventHistory];
    return this.eventHistory.filter(e => e.type === type);
  }

  /** Limpa o histórico (apenas para testes) */
  _clearForTesting(): void {
    this.eventHistory.length = 0;
  }
}