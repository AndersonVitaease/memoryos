/**
 * AuditRecord — Registro imutável de auditoria
 * Foundation: MCS, MREM Etapa 11
 * Sprint: 1
 */

/** Resultado de uma operação auditada */
export type AuditOutcome = "success" | "failure" | "blocked";

/** Registro de auditoria para operações de memória */
export interface MemoryAuditRecord {
  readonly id: string;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly component: "WorkingMemoryEngine";
  readonly action: MemoryAuditAction;
  readonly outcome: AuditOutcome;
  readonly userId: string;
  readonly sessionId: string;
  readonly itemId?: string;
  readonly itemKey?: string;
  readonly details?: Record<string, string | number | boolean>;
  readonly durationMs: number;
}

export type MemoryAuditAction =
  | "memory.store"
  | "memory.get"
  | "memory.remove"
  | "memory.evict"
  | "memory.promote"
  | "memory.touch"
  | "memory.clear_context"
  | "memory.evict_expired";