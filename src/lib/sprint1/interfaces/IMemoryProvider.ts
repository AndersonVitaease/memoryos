/**
 * IMemoryProvider — MemoryOS Public Interface
 * Foundation: MCS, MPAR, MRS Cap.3
 * Sprint: 1
 */

import type { MemoryRecord } from "../types/MemoryRecord";
import type { IdentityContext } from "../types/IdentityContext";
import type { MemoryFilter } from "../types/MemoryFilter";

/**
 * Contrato base para qualquer provider de memória no MemoryOS.
 * Toda implementação DEVE respeitar isolamento de IdentityContext.
 * MPAR ref: IMemoryProvider
 */
export interface IMemoryProvider {
  /**
   * Armazena um registro na memória.
   * @param record - Item a armazenar (sem id, gerado internamente)
   * @param ctx    - Contexto de identidade (isolamento obrigatório)
   * @returns ID do registro armazenado
   */
  store(record: Omit<MemoryRecord, "id" | "storedAt">, ctx: IdentityContext): Promise<string>;

  /**
   * Recupera um registro pelo ID.
   * @returns null se não encontrado ou expirado
   */
  get(id: string, ctx: IdentityContext): Promise<MemoryRecord | null>;

  /**
   * Remove um registro pelo ID.
   * @returns true se removido, false se inexistente
   */
  remove(id: string, ctx: IdentityContext): Promise<boolean>;

  /**
   * Filtra registros pelo contexto e critérios.
   */
  filter(filter: MemoryFilter, ctx: IdentityContext): Promise<MemoryRecord[]>;

  /**
   * Retorna estatísticas de uso do provider.
   */
  stats(ctx: IdentityContext): Promise<MemoryProviderStats>;

  /**
   * Limpa todos os registros expirados (TTL cleanup).
   * @returns número de registros removidos
   */
  evictExpired(): Promise<number>;

  /**
   * Remove todos os registros de um contexto específico.
   * Usado para reset de sessão.
   */
  clearContext(ctx: IdentityContext): Promise<number>;
}

/** Estatísticas de uso do provider */
export interface MemoryProviderStats {
  totalItems: number;
  itemsByContext: Record<string, number>;
  itemsByPriority: Record<string, number>;
  oldestItem: string | null;
  newestItem: string | null;
  approximateSizeBytes: number;
}