/**
 * WorkingMemoryItem — Unidade de dado na Working Memory
 * Foundation: MRS Cap.3, MPAR IWorkingMemoryEngine
 * Sprint: 1
 */

import type { MemoryPriority } from "./MemoryPriority";

/** Item armazenado na Working Memory */
export interface WorkingMemoryItem {
  /** ID único gerado internamente (UUID v4) */
  readonly id: string;

  /** Chave semântica para recuperação por padrão (ex: "cpf:123:status") */
  readonly key: string;

  /** Valor serializado do item */
  value: unknown;

  /** Prioridade — determina eviction order e TTL default */
  readonly priority: MemoryPriority;

  /** Timestamp de armazenamento (epoch ms) */
  readonly storedAt: number;

  /** Timestamp de expiração (epoch ms) */
  expiresAt: number;

  /** Número de acessos — usado para promoção a LTM */
  accessCount: number;

  /** Última vez que foi acessado (epoch ms) */
  lastAccessedAt: number;

  /** Se este item deve ser promovido automaticamente para LTM */
  readonly autoPromote: boolean;

  /** Metadados adicionais livres */
  readonly metadata?: Record<string, string | number | boolean>;
}

/** Resultado de uma operação de store */
export interface StoreResult {
  readonly id: string;
  readonly key: string;
  readonly expiresAt: number;
  readonly evicted?: EvictedItemSummary;
}

/** Resumo de item removido por eviction */
export interface EvictedItemSummary {
  readonly id: string;
  readonly key: string;
  readonly priority: MemoryPriority;
  readonly reason: "ttl_expired" | "capacity_exceeded";
}