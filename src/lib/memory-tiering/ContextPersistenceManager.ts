/**
 * ContextPersistenceManager.ts — P2: Context Persistence entre sessões
 *
 * Garante que o contexto cognitivo (summary, tópicos, decisões, entidades)
 * seja preservado e restaurável entre sessões diferentes.
 *
 * Estratégia:
 *   1. Ao arquivar uma sessão, extrai o summary e persiste no ChatSession
 *   2. Ao iniciar nova sessão, busca context das últimas N sessões históricas/arquivadas
 *   3. Retorna CrossSessionContext para uso no ConversationContext
 *
 * GARANTIAS:
 *   - Nunca lança exceção
 *   - Singleton HMR-safe via globalThis
 */

import { base44 } from "@/api/base44Client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrossSessionContext {
  readonly recentSummaries:  readonly string[];
  readonly persistedTopics:  readonly string[];
  readonly persistedEntities: readonly string[];
  readonly sessionCount:     number;
  readonly builtAt:          number;
}

// ── ContextPersistenceManager ─────────────────────────────────────────────────

class ContextPersistenceManagerClass {

  /**
   * Recupera contexto das últimas sessões do usuário (exceto a sessão atual).
   * Usado pelo ConversationContext para enriquecer o LLM com histórico cross-session.
   */
  async getCrossSessionContext(
    currentSessionId: string,
    projectId?: string | null,
    maxSessions = 5,
  ): Promise<CrossSessionContext> {
    const t0 = Date.now();

    try {
      // Busca sessões recentes (historical ou archived) com summary
      const filter: Record<string, unknown> = { status: ["historical", "active"] };
      if (projectId) filter.project_id = projectId;

      const recentSessions = await base44.entities.ChatSession.filter(
        filter,
        "-last_message_at",
        maxSessions + 1,
      );

      // Exclui sessão atual e sessões sem summary
      const otherSessions = (recentSessions ?? [])
        .filter((s) => s.id !== currentSessionId && s.summary)
        .slice(0, maxSessions);

      if (otherSessions.length === 0) {
        return Object.freeze({ recentSummaries: [], persistedTopics: [], persistedEntities: [], sessionCount: 0, builtAt: Date.now() });
      }

      const recentSummaries = otherSessions
        .map((s) => String(s.summary ?? ""))
        .filter(Boolean);

      // Busca tópicos ativos do projeto
      const topicsFilter = projectId ? { project_id: projectId, status: "active" } : { status: "active" };
      const topics = await base44.entities.Topic.filter(topicsFilter, "-created_date", 10).catch(() => []);
      const persistedTopics = (topics ?? []).map((t: { name: string }) => t.name).filter(Boolean);

      // Busca entidades recentes do projeto
      const entitiesFilter = projectId ? { project_id: projectId } : {};
      const entities = await base44.entities.KnowledgeEntity.filter(entitiesFilter, "-created_date", 15).catch(() => []);
      const persistedEntities = (entities ?? [])
        .map((e: { type: string; value: string }) => `${e.type}: ${e.value}`)
        .filter(Boolean);

      return Object.freeze({
        recentSummaries,
        persistedTopics,
        persistedEntities,
        sessionCount:   otherSessions.length,
        builtAt:        Date.now(),
      });

    } catch {
      return Object.freeze({ recentSummaries: [], persistedTopics: [], persistedEntities: [], sessionCount: 0, builtAt: Date.now() });
    }
  }

  /**
   * Formata CrossSessionContext como string para injeção no prompt.
   * Retorna null se não houver contexto relevante.
   */
  formatForPrompt(ctx: CrossSessionContext): string | null {
    const parts: string[] = [];

    if (ctx.recentSummaries.length > 0) {
      parts.push(`CONTEXTO DE SESSOES ANTERIORES:\n${ctx.recentSummaries.slice(0, 3).join("\n\n---\n\n")}`);
    }
    if (ctx.persistedTopics.length > 0) {
      parts.push(`TOPICOS PERSISTENTES: ${ctx.persistedTopics.join(", ")}`);
    }
    if (ctx.persistedEntities.length > 0) {
      parts.push(`ENTIDADES CONHECIDAS: ${ctx.persistedEntities.slice(0, 10).join(", ")}`);
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  }
}

// ── Singleton HMR-safe ────────────────────────────────────────────────────────

const _KEY = "__CONTEXT_PERSISTENCE__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ContextPersistenceManagerClass();
}

export const contextPersistenceManager: ContextPersistenceManagerClass = (
  globalThis as unknown as Record<string, ContextPersistenceManagerClass>
)[_KEY];