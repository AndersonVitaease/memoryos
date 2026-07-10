/**
 * MemoryAuditLogger — Auditoria imutável para Working Memory
 * Foundation: MCS, MREM Etapa 11
 * Sprint: 1
 *
 * Toda mutação na Working Memory DEVE gerar um AuditRecord.
 * Records são Object.freeze() — imutáveis após criação.
 */

import type { MemoryAuditRecord, MemoryAuditAction, AuditOutcome } from "../types/AuditRecord";
import type { IdentityContext } from "../types/IdentityContext";
import { generateId } from "../utils/uuid";

export class MemoryAuditLogger {
  private readonly records: MemoryAuditRecord[] = [];

  /**
   * Registra uma operação de memória.
   * O record é congelado imediatamente após criação.
   */
  record(params: {
    correlationId: string;
    action: MemoryAuditAction;
    outcome: AuditOutcome;
    ctx: IdentityContext;
    startedAt: number;
    itemId?: string;
    itemKey?: string;
    details?: Record<string, string | number | boolean>;
  }): MemoryAuditRecord {
    const record: MemoryAuditRecord = Object.freeze({
      id:            generateId(),
      correlationId: params.correlationId,
      timestamp:     Date.now(),
      component:     "WorkingMemoryEngine",
      action:        params.action,
      outcome:       params.outcome,
      userId:        params.ctx.userId,
      sessionId:     params.ctx.sessionId,
      itemId:        params.itemId,
      itemKey:       params.itemKey,
      details:       params.details,
      durationMs:    Date.now() - params.startedAt,
    });

    this.records.push(record);
    return record;
  }

  /**
   * Consulta registros com filtros opcionais.
   */
  query(filter?: {
    userId?:        string;
    sessionId?:     string;
    action?:        MemoryAuditAction;
    outcome?:       AuditOutcome;
    since?:         number;
    correlationId?: string;
  }): MemoryAuditRecord[] {
    let results = [...this.records];

    if (filter?.userId)        results = results.filter(r => r.userId === filter.userId);
    if (filter?.sessionId)     results = results.filter(r => r.sessionId === filter.sessionId);
    if (filter?.action)        results = results.filter(r => r.action === filter.action);
    if (filter?.outcome)       results = results.filter(r => r.outcome === filter.outcome);
    if (filter?.since)         results = results.filter(r => r.timestamp >= filter.since!);
    if (filter?.correlationId) results = results.filter(r => r.correlationId === filter.correlationId);

    return results;
  }

  /** Total de records armazenados */
  get size(): number {
    return this.records.length;
  }

  /** Limpa o audit log (apenas para testes) */
  _clearForTesting(): void {
    this.records.length = 0;
  }
}