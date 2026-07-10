/**
 * WorkingMemoryEngine — Implementação de Referência
 * Foundation: MRS Cap.3, MCS, MPAR IWorkingMemoryEngine, MREM Etapa 10
 * Sprint: 1
 *
 * Implementa IWorkingMemoryEngine com:
 * - Isolamento por IdentityContext
 * - TTL automático
 * - Eviction por prioridade (lowest first)
 * - AuditTrail para toda mutação
 * - Eventos publicados no catálogo oficial (MREM Cap.4)
 * - Promoção para Long Term Memory
 */

import type { IWorkingMemoryEngine } from "./interfaces/IWorkingMemoryEngine";
import type { WorkingMemoryItem, StoreResult } from "./types/WorkingMemoryItem";
import type { IdentityContext } from "./types/IdentityContext";
import type { MemoryPromotionResult } from "./types/MemoryPromotionResult";
import type { MemoryProviderStats } from "./interfaces/IMemoryProvider";

import { MemoryPriority, DEFAULT_TTL_BY_PRIORITY, priorityLabel } from "./types/MemoryPriority";
import { buildPartitionKey } from "./types/IdentityContext";
import { WorkingMemoryStore } from "./core/WorkingMemoryStore";
import { MemoryAuditLogger } from "./core/MemoryAuditLogger";
import { MemoryEventEmitter, type EventHandler } from "./core/MemoryEventEmitter";
import { generateId } from "./utils/uuid";
import { validateContext, validateStoreInput, validateExtraTtl } from "./utils/validators";

/** Threshold de acesso para promoção automática para LTM */
const AUTO_PROMOTE_ACCESS_THRESHOLD = 3;

/** Intervalo de eviction automático (ms) */
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export class WorkingMemoryEngine implements IWorkingMemoryEngine {
  private readonly store   = new WorkingMemoryStore();
  private readonly audit   = new MemoryAuditLogger();
  private readonly emitter = new MemoryEventEmitter();

  /** Timer de eviction automático */
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startEvictionTimer();
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Armazena um item com TTL e prioridade.
   * TTL default é calculado pela prioridade caso expiresAt não seja fornecido.
   *
   * @throws MemoryValidationError se entrada inválida
   * @returns StoreResult com id, key e expiresAt
   */
  async store(
    input: Omit<WorkingMemoryItem, "id" | "storedAt">,
    ctx: IdentityContext
  ): Promise<string> {
    const startedAt = Date.now();
    const correlationId = generateId();

    validateContext(ctx);
    validateStoreInput(input);

    const item: WorkingMemoryItem = {
      id:             generateId(),
      key:            input.key,
      value:          input.value,
      priority:       input.priority,
      storedAt:       Date.now(),
      expiresAt:      input.expiresAt ?? Date.now() + DEFAULT_TTL_BY_PRIORITY[input.priority],
      accessCount:    0,
      lastAccessedAt: Date.now(),
      autoPromote:    input.autoPromote ?? false,
      metadata:       input.metadata,
    };

    const evicted = this.store.set(item, ctx);

    // Audit: eviction (se ocorreu)
    if (evicted) {
      this.audit.record({
        correlationId,
        action:  "memory.evict",
        outcome: "success",
        ctx,
        startedAt,
        itemId:  evicted.id,
        itemKey: evicted.key,
        details: { reason: "capacity_exceeded", priority: evicted.priority },
      });
      this.emitter.emit({
        type:          "memory.evicted",
        correlationId,
        ctx,
        itemId:  evicted.id,
        itemKey: evicted.key,
        details: { reason: "capacity_exceeded" },
      });
    }

    // Audit: store
    this.audit.record({
      correlationId,
      action:  "memory.store",
      outcome: "success",
      ctx,
      startedAt,
      itemId:  item.id,
      itemKey: item.key,
      details: { priority: item.priority, ttlMs: item.expiresAt - item.storedAt },
    });

    // Event
    this.emitter.emit({
      type:          "memory.stored",
      correlationId,
      ctx,
      itemId:  item.id,
      itemKey: item.key,
      details: { priority: item.priority },
    });

    return item.id;
  }

  /**
   * Recupera item por ID.
   * Incrementa accessCount e verifica threshold de promoção automática.
   * @returns null se não encontrado ou expirado
   */
  async get(id: string, ctx: IdentityContext): Promise<WorkingMemoryItem | null> {
    const startedAt = Date.now();
    const correlationId = generateId();

    validateContext(ctx);

    const item = this.store.get(id, ctx);

    if (!item) {
      this.audit.record({
        correlationId,
        action:  "memory.get",
        outcome: "failure",
        ctx,
        startedAt,
        itemId:  id,
        details: { reason: "not_found_or_expired" },
      });
      return null;
    }

    // Atualiza contadores de acesso (mutação controlada)
    item.accessCount += 1;
    item.lastAccessedAt = Date.now();

    // Audit
    this.audit.record({
      correlationId,
      action:  "memory.get",
      outcome: "success",
      ctx,
      startedAt,
      itemId:  item.id,
      itemKey: item.key,
      details: { accessCount: item.accessCount },
    });

    // Event
    this.emitter.emit({
      type:          "memory.retrieved",
      correlationId,
      ctx,
      itemId:  item.id,
      itemKey: item.key,
    });

    // Promoção automática por threshold
    if (
      item.autoPromote &&
      item.accessCount >= AUTO_PROMOTE_ACCESS_THRESHOLD
    ) {
      await this.promote(item.id, ctx);
    }

    return item;
  }

  /**
   * Remove item por ID.
   * @returns true se removido, false se inexistente no contexto
   */
  async remove(id: string, ctx: IdentityContext): Promise<boolean> {
    const startedAt = Date.now();
    const correlationId = generateId();

    validateContext(ctx);

    const item = this.store.get(id, ctx);
    const removed = this.store.delete(id, ctx);

    this.audit.record({
      correlationId,
      action:  "memory.remove",
      outcome: removed ? "success" : "failure",
      ctx,
      startedAt,
      itemId:  id,
      itemKey: item?.key,
      details: { found: removed },
    });

    if (removed) {
      this.emitter.emit({
        type:    "memory.removed",
        correlationId,
        ctx,
        itemId:  id,
        itemKey: item?.key,
      });
    }

    return removed;
  }

  /**
   * Filtra itens por padrão de key (prefixo).
   * Apenas itens não expirados e pertencentes ao contexto.
   */
  async findByKey(keyPattern: string, ctx: IdentityContext): Promise<WorkingMemoryItem[]> {
    validateContext(ctx);
    const now = Date.now();
    return this.store
      .getAll(ctx)
      .filter(item => item.key.startsWith(keyPattern) && now <= item.expiresAt);
  }

  /**
   * Estende o TTL de um item existente.
   * @returns true se atualizado
   */
  async touch(id: string, extraTtlMs: number, ctx: IdentityContext): Promise<boolean> {
    const startedAt = Date.now();
    const correlationId = generateId();

    validateContext(ctx);
    validateExtraTtl(extraTtlMs);

    const item = this.store.get(id, ctx);
    if (!item) {
      this.audit.record({ correlationId, action: "memory.touch", outcome: "failure", ctx, startedAt, itemId: id });
      return false;
    }

    item.expiresAt = item.expiresAt + extraTtlMs;

    this.audit.record({
      correlationId,
      action:  "memory.touch",
      outcome: "success",
      ctx,
      startedAt,
      itemId:  item.id,
      itemKey: item.key,
      details: { extraTtlMs, newExpiresAt: item.expiresAt },
    });

    return true;
  }

  /**
   * Promove um item para Long Term Memory.
   * No Sprint 1, a promoção é registrada via audit + evento.
   * A persistência real em LTM será implementada no Sprint 5 (EPIC-004).
   */
  async promote(id: string, ctx: IdentityContext): Promise<MemoryPromotionResult> {
    const startedAt = Date.now();
    const correlationId = generateId();

    validateContext(ctx);

    const item = this.store.get(id, ctx);

    if (!item) {
      return { success: false, itemId: id, key: "", reason: "item_not_found", promotedAt: Date.now() };
    }

    const result: MemoryPromotionResult = {
      success:     true,
      itemId:      item.id,
      key:         item.key,
      reason:      item.autoPromote ? "auto_promote_flag" : item.accessCount >= AUTO_PROMOTE_ACCESS_THRESHOLD ? "access_threshold" : "manual",
      promotedAt:  Date.now(),
    };

    this.audit.record({
      correlationId,
      action:  "memory.promote",
      outcome: "success",
      ctx,
      startedAt,
      itemId:  item.id,
      itemKey: item.key,
      details: { reason: result.reason, accessCount: item.accessCount },
    });

    this.emitter.emit({
      type:    "memory.promoted",
      correlationId,
      ctx,
      itemId:  item.id,
      itemKey: item.key,
      details: { reason: result.reason },
    });

    return result;
  }

  /**
   * Retorna estatísticas do engine para o contexto.
   */
  async stats(ctx: IdentityContext): Promise<MemoryProviderStats> {
    validateContext(ctx);
    const s = this.store.statsForPartition(ctx);
    const partitionKey = buildPartitionKey(ctx);

    const byPriority: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.byPriority)) {
      byPriority[priorityLabel(Number(k) as MemoryPriority)] = v;
    }

    return {
      totalItems:           s.total,
      itemsByContext:       { [partitionKey]: s.total },
      itemsByPriority:      byPriority,
      oldestItem:           s.oldest,
      newestItem:           s.newest,
      approximateSizeBytes: s.total * 512, // estimativa conservadora
    };
  }

  /**
   * Força uma passagem de eviction de itens expirados.
   * @returns número de itens removidos
   */
  async runEviction(): Promise<number> {
    const startedAt = Date.now();
    const correlationId = generateId();
    const dummyCtx: IdentityContext = { userId: "system", domain: "outro", sessionId: "eviction" };

    const { count, items } = this.store.evictAllExpired();

    for (const item of items) {
      this.emitter.emit({
        type:          "memory.expired",
        correlationId,
        ctx:           dummyCtx,
        itemId:  item.id,
        itemKey: item.key,
        details: { expiredAt: item.expiresAt },
      });
    }

    this.audit.record({
      correlationId,
      action:  "memory.evict_expired",
      outcome: "success",
      ctx:     dummyCtx,
      startedAt,
      details: { removedCount: count },
    });

    this.emitter.emit({
      type:    "memory.eviction_run",
      correlationId,
      ctx:     dummyCtx,
      details: { removedCount: count },
    });

    return count;
  }

  /**
   * Remove todos os itens de um contexto.
   * Usado em logout ou reset de sessão.
   */
  async clearContext(ctx: IdentityContext): Promise<number> {
    const startedAt = Date.now();
    const correlationId = generateId();

    validateContext(ctx);

    const count = this.store.clearPartition(ctx);

    this.audit.record({
      correlationId,
      action:  "memory.clear_context",
      outcome: "success",
      ctx,
      startedAt,
      details: { removedCount: count },
    });

    this.emitter.emit({
      type:    "memory.cleared",
      correlationId,
      ctx,
      details: { removedCount: count },
    });

    return count;
  }

  // ─── Observability API ────────────────────────────────────────────────

  /** Registra um handler para eventos do engine */
  onEvent(handler: EventHandler): void {
    this.emitter.onEvent(handler);
  }

  /** Consulta o audit log interno */
  queryAudit(filter?: Parameters<MemoryAuditLogger["query"]>[0]) {
    return this.audit.query(filter);
  }

  /** Retorna histórico de eventos para observabilidade */
  eventHistory(type?: Parameters<MemoryEventEmitter["getHistory"]>[0]) {
    return this.emitter.getHistory(type);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /** Inicia timer de eviction automático */
  private startEvictionTimer(): void {
    if (typeof setInterval === "undefined") return;
    this.evictionTimer = setInterval(() => {
      this.runEviction().catch(() => { /* silent */ });
    }, EVICTION_INTERVAL_MS);
  }

  /** Destrói o engine liberando recursos (timers) */
  destroy(): void {
    if (this.evictionTimer !== null) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
  }
}