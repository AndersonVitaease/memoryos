/**
 * MemoryFilter — Critérios de busca na memória
 * Foundation: MRS Cap.3
 * Sprint: 1
 */

import type { MemoryPriority } from "./MemoryPriority";

/** Filtros para busca de registros no IMemoryProvider */
export interface MemoryFilter {
  /** Prefixo da key para matching parcial */
  keyPrefix?: string;
  /** Prioridade específica */
  priority?: MemoryPriority;
  /** Apenas itens que ainda não expiraram */
  excludeExpired?: boolean;
  /** Apenas itens com autoPromote=true */
  onlyAutoPromote?: boolean;
  /** Limite de resultados */
  limit?: number;
}