/**
 * ConversationContext.ts
 * Builds intelligent context for each LLM call.
 * Not just slice(-30) — uses memory, knowledge, entities, topics, decisions, tasks.
 * MDS v2.0 compliant
 */

import { base44 } from "@/api/base44Client";
import type { ConversationContext, ConversationMessage, ConversationSession } from "./CXPTypes";

// ─── Context Builder ──────────────────────────────────────────────────────────

export async function buildConversationContext(
  session: ConversationSession,
  messages: ConversationMessage[],
  onPhase?: (phase: string) => void
): Promise<ConversationContext> {
  const t0 = Date.now();
  const projectId = session.project_id;

  // Recent messages — last 30, prioritizing user/assistant alternation
  const recentMessages = messages.slice(-30);

  onPhase?.("retrieving_memory");

  // Parallel fetch of all memory signals
  const [entities, keywords, topics, decisions, tasks] = await Promise.allSettled([
    projectId
      ? base44.entities.KnowledgeEntity.filter({ project_id: projectId }, "-created_date", 20)
      : base44.entities.KnowledgeEntity.list("-created_date", 20),
    projectId
      ? base44.entities.Keyword.filter({ project_id: projectId }, "-created_date", 30)
      : base44.entities.Keyword.list("-created_date", 30),
    projectId
      ? base44.entities.Topic.filter({ project_id: projectId, status: "active" }, "-created_date", 10)
      : base44.entities.Topic.filter({ status: "active" }, "-created_date", 10),
    projectId
      ? base44.entities.Decision.filter({ project_id: projectId }, "-created_date", 10)
      : base44.entities.Decision.list("-created_date", 10),
    projectId
      ? base44.entities.Task.filter({ project_id: projectId, status: "pending" }, "-created_date", 10)
      : base44.entities.Task.filter({ status: "pending" }, "-created_date", 10),
  ]);

  const safeValue = <T>(result: PromiseSettledResult<T[]>): T[] =>
    result.status === "fulfilled" ? result.value : [];

  const entitiesData = safeValue(entities as PromiseSettledResult<{ type: string; value: string }[]>);
  const keywordsData = safeValue(keywords as PromiseSettledResult<{ keyword: string }[]>);
  const topicsData = safeValue(topics as PromiseSettledResult<{ name: string; description?: string }[]>);
  const decisionsData = safeValue(decisions as PromiseSettledResult<{ title: string; description?: string }[]>);
  const tasksData = safeValue(tasks as PromiseSettledResult<{ title: string; status: string }[]>);

  const entitiesContext =
    entitiesData.length > 0
      ? entitiesData.map((e) => `${e.type}: ${e.value}`).join(", ")
      : undefined;

  const knowledgeContext =
    keywordsData.length > 0
      ? keywordsData.map((k) => k.keyword).join(", ")
      : undefined;

  const topicsContext =
    topicsData.length > 0
      ? topicsData.map((t) => `${t.name}${t.description ? ": " + t.description : ""}`).join("; ")
      : undefined;

  const decisionsContext =
    decisionsData.length > 0
      ? decisionsData.map((d) => d.title).join("; ")
      : undefined;

  const tasksContext =
    tasksData.length > 0
      ? tasksData.filter((t) => t.status === "pending").map((t) => t.title).join("; ")
      : undefined;

  // ── [KR-02] StateView injection (somente quando injectEnabled=true) ──────
  let stateViewContext: string | undefined;
  try {
    const { stateViewEngine, getStateViewFlags } = await import("@/lib/knowledge-registry/StateViewEngine");
    const flags = getStateViewFlags();
    if (flags.injectEnabled) {
      const sv = await stateViewEngine.buildForSession(session.id, projectId);
      if (sv.llmContext) stateViewContext = sv.llmContext;
    }
  } catch { /* nunca bloqueia contexto */ }
  // ── [END KR-02] ──────────────────────────────────────────────────────────

  // ── [P2] Cross-Session Context Persistence ────────────────────────────────
  let crossSessionContext: string | undefined;
  try {
    const { contextPersistenceManager } = await import("@/lib/memory-tiering/ContextPersistenceManager");
    const crossCtx = await contextPersistenceManager.getCrossSessionContext(session.id, projectId);
    const formatted = contextPersistenceManager.formatForPrompt(crossCtx);
    if (formatted) crossSessionContext = formatted;
  } catch { /* nunca bloqueia contexto */ }
  // ── [END P2] ──────────────────────────────────────────────────────────────

  return {
    sessionId: session.id,
    projectId,
    recentMessages,
    sessionSummary: session.summary,
    entitiesContext,
    knowledgeContext,
    topicsContext,
    decisionsContext,
    tasksContext,
    stateViewContext,
    crossSessionContext,
    builtAt: Date.now(),
  };
}

// ─── Context to Prompt ────────────────────────────────────────────────────────

export function contextToPromptParts(ctx: ConversationContext): string {
  const parts: string[] = [];

  if (ctx.sessionSummary) {
    parts.push(`RESUMO DA SESSAO:\n${ctx.sessionSummary}`);
  }
  if (ctx.entitiesContext) {
    parts.push(`ENTIDADES IDENTIFICADAS: ${ctx.entitiesContext}`);
  }
  if (ctx.topicsContext) {
    parts.push(`ASSUNTOS ATIVOS: ${ctx.topicsContext}`);
  }
  if (ctx.decisionsContext) {
    parts.push(`DECISOES REGISTRADAS: ${ctx.decisionsContext}`);
  }
  if (ctx.tasksContext) {
    parts.push(`TAREFAS PENDENTES: ${ctx.tasksContext}`);
  }
  if (ctx.knowledgeContext) {
    parts.push(`PALAVRAS-CHAVE: ${ctx.knowledgeContext}`);
  }
  if (ctx.crossSessionContext) {
    parts.push(ctx.crossSessionContext);
  }
  if (ctx.stateViewContext) {
    parts.push(ctx.stateViewContext);
  }

  return parts.join("\n\n");
}

export function historyToText(messages: ConversationMessage[]): string {
  return messages
    .slice(-30)
    .map((m) => `${m.role === "user" ? "Usuario" : "MemoryOS"}: ${m.content}`)
    .join("\n");
}