/**
 * MRI — MemoryOS Reference Implementation
 * Working Memory Engine (MCS + MDS v1.6 + MRS Capítulo 4)
 *
 * TTL por tipo, eviction por prioridade, flush para short-term.
 */

import type { MemoryRecord, MemoryQuery, IMemoryProvider } from "../interfaces";

// TTLs em segundos (MDS v1.6)
const DEFAULT_TTL: Record<string, number> = {
  CONVERSATION_TURN: 60 * 60,       // 60 min
  ACTIVE_GOAL:       Infinity,       // duração da sessão
  ENTITY_EXTRACTED:  2 * 60 * 60,   // 120 min
  USER_PREFERENCE:   0,              // promovido imediatamente
  DECISION:          4 * 60 * 60,
  FACT:              2 * 60 * 60,
  DOCUMENT:          4 * 60 * 60,
};

const MAX_RECORDS = 200;

export class WorkingMemoryEngine implements IMemoryProvider {
  private store = new Map<string, MemoryRecord & { expiresAt: number }>();

  async store(record: MemoryRecord): Promise<MemoryRecord> {
    this.evict();

    const ttl = record.ttlSeconds ?? DEFAULT_TTL[record.type] ?? 3600;
    const memoryId = record.memoryId ?? `wm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    const expiresAt = ttl === Infinity ? Infinity : now + ttl * 1000;

    const stored: MemoryRecord & { expiresAt: number } = {
      ...record,
      memoryId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    };

    this.store.set(memoryId, stored);

    // USER_PREFERENCE promovido imediatamente — emitir evento
    if (record.type === "USER_PREFERENCE") {
      // Em produção: eventBus.publish("memory.promote", stored)
    }

    return stored;
  }

  async retrieve(query: MemoryQuery): Promise<MemoryRecord[]> {
    this.evict();
    const now = Date.now();
    const results: MemoryRecord[] = [];

    for (const record of this.store.values()) {
      if (record.expiresAt < now) continue;
      if (query.userId && record.userId !== query.userId) continue;
      if (query.identityContext && record.identityContext !== query.identityContext) continue;
      if (query.journeyId && record.journeyId !== query.journeyId) continue;
      if (query.type && record.type !== query.type) continue;
      if (query.tier && record.tier !== query.tier) continue;
      results.push(record);
    }

    return results
      .sort((a, b) => b.priority - a.priority)
      .slice(0, query.limit ?? 50);
  }

  async delete(memoryId: string): Promise<void> {
    this.store.delete(memoryId);
  }

  async flush(sessionId: string): Promise<void> {
    // Promover registros com priority >= 0.6 para short-term (MRS Cap. 4)
    for (const [id, record] of this.store.entries()) {
      if (record.sessionId === sessionId) {
        if (record.priority < 0.6) {
          this.store.delete(id);
        }
        // priority >= 0.6: em produção → short-term memory store
      }
    }
  }

  async getStats(userId: string) {
    const records = [...this.store.values()].filter(r => r.userId === userId);
    const byTier: Record<string, number> = {};
    const byType: Record<string, number> = {};
    records.forEach(r => {
      byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    });
    const times = records.map(r => r.createdAt ?? "").sort();
    return {
      totalRecords: records.length,
      byTier: byTier as any,
      byType,
      oldestRecord: times[0] ?? "",
      newestRecord: times[times.length - 1] ?? "",
    };
  }

  /** Remove registros expirados e faz eviction por prioridade se necessário */
  private evict(): void {
    const now = Date.now();
    for (const [id, r] of this.store.entries()) {
      if (r.expiresAt !== Infinity && r.expiresAt < now) {
        this.store.delete(id);
      }
    }
    if (this.store.size > MAX_RECORDS) {
      const sorted = [...this.store.entries()].sort((a, b) => a[1].priority - b[1].priority);
      const toRemove = sorted.slice(0, this.store.size - MAX_RECORDS);
      toRemove.forEach(([id]) => this.store.delete(id));
    }
  }

  get size(): number { return this.store.size; }
}