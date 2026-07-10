/**
 * WorkingMemoryStore — Armazenamento interno isolado por partição
 * Foundation: MRS Cap.3, MCS
 * Sprint: 1
 *
 * Responsabilidades:
 * - Manter Map isolado por partitionKey (IdentityContext)
 * - Impedir acesso cruzado entre contextos
 * - Nenhum item de ctxA é acessível em ctxB
 */

import type { WorkingMemoryItem } from "../types/WorkingMemoryItem";
import { buildPartitionKey, type IdentityContext } from "../types/IdentityContext";

/** Capacidade máxima por partição */
const MAX_ITEMS_PER_PARTITION = 500;

export class WorkingMemoryStore {
  /** Map<partitionKey, Map<itemId, WorkingMemoryItem>> */
  private readonly partitions = new Map<string, Map<string, WorkingMemoryItem>>();

  /**
   * Retorna (ou cria) a partição para o contexto dado.
   * Partições são SEMPRE isoladas por partitionKey.
   */
  private partition(ctx: IdentityContext): Map<string, WorkingMemoryItem> {
    const key = buildPartitionKey(ctx);
    if (!this.partitions.has(key)) {
      this.partitions.set(key, new Map());
    }
    return this.partitions.get(key)!;
  }

  /** Verifica se o item com este ID pertence ao contexto dado */
  private assertOwnership(id: string, ctx: IdentityContext): boolean {
    return this.partition(ctx).has(id);
  }

  /**
   * Insere um item na partição correta.
   * Se a partição atingir MAX_ITEMS_PER_PARTITION,
   * o item de menor prioridade (mais antigo se empate) é removido.
   * @returns item removido por eviction, ou null
   */
  set(item: WorkingMemoryItem, ctx: IdentityContext): WorkingMemoryItem | null {
    const p = this.partition(ctx);
    let evicted: WorkingMemoryItem | null = null;

    if (p.size >= MAX_ITEMS_PER_PARTITION && !p.has(item.id)) {
      evicted = this.evictLowestPriority(p);
    }

    p.set(item.id, item);
    return evicted;
  }

  /**
   * Recupera um item por ID; retorna null se:
   * - não existir no contexto
   * - já estiver expirado (TTL vencido)
   */
  get(id: string, ctx: IdentityContext): WorkingMemoryItem | null {
    if (!this.assertOwnership(id, ctx)) return null;
    const item = this.partition(ctx).get(id)!;
    if (Date.now() > item.expiresAt) {
      this.partition(ctx).delete(id);
      return null;
    }
    return item;
  }

  /**
   * Remove item por ID; retorna false se não existir no contexto.
   */
  delete(id: string, ctx: IdentityContext): boolean {
    if (!this.assertOwnership(id, ctx)) return false;
    return this.partition(ctx).delete(id);
  }

  /**
   * Retorna todos os itens da partição (incluindo expirados).
   * Use com cuidado — filtragem por TTL é responsabilidade do caller.
   */
  getAll(ctx: IdentityContext): WorkingMemoryItem[] {
    return Array.from(this.partition(ctx).values());
  }

  /**
   * Remove todos os itens expirados de TODAS as partições.
   * @returns total de itens removidos
   */
  evictAllExpired(): { count: number; items: WorkingMemoryItem[] } {
    const now = Date.now();
    let count = 0;
    const items: WorkingMemoryItem[] = [];

    for (const partition of this.partitions.values()) {
      for (const [id, item] of partition) {
        if (now > item.expiresAt) {
          partition.delete(id);
          items.push(item);
          count++;
        }
      }
    }
    return { count, items };
  }

  /**
   * Remove todos os itens de uma partição específica.
   * @returns número de itens removidos
   */
  clearPartition(ctx: IdentityContext): number {
    const p = this.partition(ctx);
    const count = p.size;
    p.clear();
    return count;
  }

  /** Tamanho total da partição (sem filtro de TTL) */
  size(ctx: IdentityContext): number {
    return this.partition(ctx).size;
  }

  /** Número total de partições ativas */
  partitionCount(): number {
    return this.partitions.size;
  }

  /**
   * Remove o item de menor prioridade da partição.
   * Em caso de empate, remove o mais antigo (storedAt).
   */
  private evictLowestPriority(p: Map<string, WorkingMemoryItem>): WorkingMemoryItem | null {
    let candidate: WorkingMemoryItem | null = null;

    for (const item of p.values()) {
      if (!candidate) {
        candidate = item;
        continue;
      }
      if (
        item.priority < candidate.priority ||
        (item.priority === candidate.priority && item.storedAt < candidate.storedAt)
      ) {
        candidate = item;
      }
    }

    if (candidate) {
      p.delete(candidate.id);
    }

    return candidate;
  }

  /** Retorna estatísticas agregadas por partição */
  statsForPartition(ctx: IdentityContext): {
    total: number;
    byPriority: Record<number, number>;
    oldest: string | null;
    newest: string | null;
  } {
    const items = Array.from(this.partition(ctx).values());
    const byPriority: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let oldest: WorkingMemoryItem | null = null;
    let newest: WorkingMemoryItem | null = null;

    for (const item of items) {
      byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
      if (!oldest || item.storedAt < oldest.storedAt) oldest = item;
      if (!newest || item.storedAt > newest.storedAt) newest = item;
    }

    return {
      total: items.length,
      byPriority,
      oldest: oldest?.id ?? null,
      newest: newest?.id ?? null,
    };
  }
}