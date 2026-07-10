/**
 * IWorkingMemoryEngine — MemoryOS Public Interface
 * Foundation: MCS, MPAR, MRS Cap.3, MREM Etapa 10
 * Sprint: 1
 */

import type { WorkingMemoryItem } from "../types/WorkingMemoryItem";
import type { IdentityContext } from "../types/IdentityContext";
import type { MemoryPromotionResult } from "../types/MemoryPromotionResult";
import type { MemoryProviderStats } from "./IMemoryProvider";

/**
 * Engine de memória de trabalho do MemoryOS.
 * Gerencia estado de curto prazo, TTL, eviction por prioridade
 * e promoção para Long Term Memory.
 *
 * Regras imutáveis (MCS):
 * - Todo store/get deve respeitar identityContext
 * - Nenhum item de contexto A é visível em contexto B
 * - Eviction remove sempre o item de menor prioridade
 */
export interface IWorkingMemoryEngine {
  /** Armazena item com TTL e prioridade */
  store(item: Omit<WorkingMemoryItem, "id" | "storedAt">, ctx: IdentityContext): Promise<string>;

  /** Recupera item por ID; retorna null se expirado ou não encontrado */
  get(id: string, ctx: IdentityContext): Promise<WorkingMemoryItem | null>;

  /** Remove item por ID */
  remove(id: string, ctx: IdentityContext): Promise<boolean>;

  /** Filtra itens por key parcial ou metadata */
  findByKey(keyPattern: string, ctx: IdentityContext): Promise<WorkingMemoryItem[]>;

  /** Atualiza TTL de um item existente */
  touch(id: string, extraTtlMs: number, ctx: IdentityContext): Promise<boolean>;

  /** Promove item para Long Term Memory */
  promote(id: string, ctx: IdentityContext): Promise<MemoryPromotionResult>;

  /** Estatísticas do engine para o contexto */
  stats(ctx: IdentityContext): Promise<MemoryProviderStats>;

  /** Força eviction de itens expirados */
  runEviction(): Promise<number>;

  /** Limpa todo o contexto (logout / reset de sessão) */
  clearContext(ctx: IdentityContext): Promise<number>;
}