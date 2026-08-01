/**
 * MemoryTieringService.ts — P2: Memory Tiering
 *
 * Implementa a transição de tiers de memória conforme MRS + ROADMAP P2:
 *   active    → histórico após inatividade de ACTIVE_TTL_DAYS dias
 *   historical → archived após inatividade de HISTORICAL_TTL_DAYS dias
 *
 * Escopo: ChatSession + Message + KnowledgeObservation
 *
 * GARANTIAS:
 *   - Fire-and-forget: nunca lança exceção para o caller
 *   - Nunca deleta dados — apenas promove tier
 *   - Singleton HMR-safe via globalThis
 *
 * ROLLBACK: remover chamada de runTiering() no ConversationBackgroundProcessor.
 */

import { base44 } from "@/api/base44Client";

// ── Config ────────────────────────────────────────────────────────────────────

const ACTIVE_TTL_DAYS     = 7;   // sessão sem atividade → historical
const HISTORICAL_TTL_DAYS = 30;  // sessão histórica sem acesso → archived

// ── MemoryTieringService ──────────────────────────────────────────────────────

class MemoryTieringServiceClass {
  private _totalPromoted = 0;
  private _lastRunAt: number | null = null;

  /**
   * Executa um ciclo de tiering para o usuário corrente.
   * Fire-and-forget — nunca lança exceção.
   */
  async run(): Promise<{ promoted: number; durationMs: number }> {
    const t0 = Date.now();
    let promoted = 0;

    try {
      const [activeToHistorical, historicalToArchived] = await Promise.allSettled([
        this._promoteActiveSessions(),
        this._promoteHistoricalSessions(),
      ]);

      if (activeToHistorical.status === "fulfilled") promoted += activeToHistorical.value;
      if (historicalToArchived.status === "fulfilled") promoted += historicalToArchived.value;

      this._totalPromoted += promoted;
      this._lastRunAt = Date.now();
    } catch { /* nunca bloqueia */ }

    return Object.freeze({ promoted, durationMs: Date.now() - t0 });
  }

  getMetrics() {
    return Object.freeze({
      totalPromoted: this._totalPromoted,
      lastRunAt:     this._lastRunAt,
      config:        Object.freeze({ ACTIVE_TTL_DAYS, HISTORICAL_TTL_DAYS }),
    });
  }

  // ── active → historical ───────────────────────────────────────────────────

  private async _promoteActiveSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - ACTIVE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const staleSessions = await base44.entities.ChatSession.filter({
      status: "active",
      last_message_at: { $lte: cutoff },
    }, "last_message_at", 20);

    if (!staleSessions || staleSessions.length === 0) return 0;

    let count = 0;
    for (const session of staleSessions) {
      try {
        await base44.entities.ChatSession.update(session.id, { status: "historical" });

        // Promove mensagens ativas desta sessão para historical
        await base44.entities.Message.updateMany(
          { session_id: session.id, memory_tier: "active" },
          { $set: { memory_tier: "historical" } },
        );

        count++;
      } catch { /* melhor esforço */ }
    }

    if (count > 0) {
      console.debug(`[MemoryTiering] active→historical: ${count} sessões promovidas`);
    }

    return count;
  }

  // ── historical → archived ─────────────────────────────────────────────────

  private async _promoteHistoricalSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - HISTORICAL_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const oldSessions = await base44.entities.ChatSession.filter({
      status: "historical",
      last_message_at: { $lte: cutoff },
    }, "last_message_at", 10);

    if (!oldSessions || oldSessions.length === 0) return 0;

    let count = 0;
    for (const session of oldSessions) {
      try {
        await base44.entities.ChatSession.update(session.id, { status: "archived" });

        // Promove mensagens desta sessão para archived
        await base44.entities.Message.updateMany(
          { session_id: session.id, memory_tier: "historical" },
          { $set: { memory_tier: "archived" } },
        );

        count++;
      } catch { /* melhor esforço */ }
    }

    if (count > 0) {
      console.debug(`[MemoryTiering] historical→archived: ${count} sessões arquivadas`);
    }

    return count;
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__MEMORY_TIERING__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new MemoryTieringServiceClass();
}

export const memoryTieringService: MemoryTieringServiceClass = (
  globalThis as unknown as Record<string, MemoryTieringServiceClass>
)[_KEY];