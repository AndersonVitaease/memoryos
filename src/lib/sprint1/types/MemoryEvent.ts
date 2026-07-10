/**
 * MemoryEvent — Eventos publicados pelo Working Memory Engine
 * Foundation: MREM Cap.4, MRS Cap.5
 * Sprint: 1
 *
 * Catálogo de eventos para o EventBus:
 * memory.stored | memory.retrieved | memory.removed |
 * memory.expired | memory.evicted | memory.promoted | memory.cleared
 */

export type MemoryEventType =
  | "memory.stored"
  | "memory.retrieved"
  | "memory.removed"
  | "memory.expired"
  | "memory.evicted"
  | "memory.promoted"
  | "memory.cleared"
  | "memory.eviction_run";

export type MemoryEventPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

/** Payload de evento publicado no EventBus */
export interface MemoryEvent {
  readonly eventId: string;
  readonly type: MemoryEventType;
  readonly priority: MemoryEventPriority;
  readonly timestamp: number;
  readonly correlationId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly itemId?: string;
  readonly itemKey?: string;
  readonly details?: Record<string, string | number | boolean>;
}

/** Mapa de prioridade por tipo de evento */
export const MEMORY_EVENT_PRIORITY: Record<MemoryEventType, MemoryEventPriority> = {
  "memory.stored":       "NORMAL",
  "memory.retrieved":    "LOW",
  "memory.removed":      "NORMAL",
  "memory.expired":      "LOW",
  "memory.evicted":      "NORMAL",
  "memory.promoted":     "LOW",
  "memory.cleared":      "HIGH",
  "memory.eviction_run": "LOW",
};