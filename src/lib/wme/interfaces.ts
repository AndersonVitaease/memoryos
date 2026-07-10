// ─── Working Memory Engine — Interfaces ──────────────────────────────────────
// Sprint 1 · Foundation v1.0 · MDS Cap.3 · MRS Cap.2

import type {
  IdentityContext, WorkingMemoryItem, MemoryFilter,
  MemoryStoreResult, MemoryRetrieveResult, MemoryPromotionResult,
  MemoryEvictionResult, MemoryEvent, AuditRecord, WMEStats,
} from "./types";

/** IMemoryProvider — contrato público do Working Memory Engine */
export interface IMemoryProvider {
  /**
   * Armazena um item na Working Memory.
   * @throws se context for inválido ou key estiver vazia
   */
  store(
    context: IdentityContext,
    key: string,
    value: unknown,
    options?: { priority?: WorkingMemoryItem["priority"]; ttl?: number; metadata?: Record<string, unknown> }
  ): Promise<MemoryStoreResult>;

  /** Recupera um item por key dentro do contexto isolado */
  retrieve(context: IdentityContext, key: string): Promise<MemoryRetrieveResult>;

  /** Lista todos os itens não expirados do contexto, com filtros opcionais */
  list(context: IdentityContext, filter?: MemoryFilter): Promise<WorkingMemoryItem[]>;

  /** Remove um item explicitamente */
  evict(context: IdentityContext, key: string): Promise<MemoryEvictionResult>;

  /** Remove todos os itens expirados do contexto */
  evictExpired(context: IdentityContext): Promise<MemoryEvictionResult>;

  /** Promove item para Long-Term Memory */
  promote(context: IdentityContext, key: string): Promise<MemoryPromotionResult>;

  /** Limpa toda a Working Memory do contexto */
  clear(context: IdentityContext): Promise<void>;

  /** Estatísticas do contexto */
  stats(context: IdentityContext): Promise<WMEStats>;
}

/** IEventPublisher — publica eventos de memória no EventBus */
export interface IEventPublisher {
  publish(event: MemoryEvent): void;
}

/** IAuditLogger — registra operações para AuditTrail */
export interface IAuditLogger {
  log(record: AuditRecord): void;
  getLogs(context: IdentityContext): AuditRecord[];
}