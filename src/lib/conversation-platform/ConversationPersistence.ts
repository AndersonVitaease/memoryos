/**
 * ConversationPersistence.ts
 * Centralizes all SDK calls for messages and sessions.
 * No direct SDK access should remain in ChatPage.
 * MDS v2.0 compliant
 */

import { base44 } from "@/api/base44Client";
import type { ConversationMessage, ConversationSession, MessageRole, MessageTier } from "./CXPTypes";

// ─── Message Persistence ──────────────────────────────────────────────────────

export async function persistMessage(params: {
  sessionId: string;
  projectId?: string;
  role: MessageRole;
  content: string;
  memory_tier?: MessageTier;
  sources_used?: string[];
}): Promise<ConversationMessage> {
  // Fase 3: workspace_id e scope sao RESOLVIDOS no backend (conversationContext).
  // O frontend nao envia workspace_id — o backend herda da ChatSession pai e
  // valida membership. Impede spoofing de workspace pelo frontend.
  const res: any = await base44.functions.invoke("conversationContext", {
    operation: "persistMessage",
    sessionId: params.sessionId,
    projectId: params.projectId,
    role: params.role,
    content: params.content,
    memoryTier: params.memory_tier ?? "active",
    sourcesUsed: params.sources_used ?? [],
  });
  const data = res?.data ?? res;
  if (!data?.ok) throw new Error(data?.error || "Falha ao persistir mensagem");
  return data.message as ConversationMessage;
}

export async function loadMessages(
  sessionId: string,
  limit = 100
): Promise<ConversationMessage[]> {
  // Busca as `limit` mensagens MAIS RECENTES (DESC) e ordena ASCENDENTE por
  // created_date. Antes usava .reverse(), que dependia do sort da API estar
  // correto — se a API ignorasse o "-created_date", o reverse produzia ordem
  // DECRESCENTE e o chat aparecia ao contrario. Sort explicito e robusto.
  const msgs = await base44.entities.Message.filter(
    { session_id: sessionId },
    "-created_date",
    limit
  );
  return (msgs as ConversationMessage[]).sort((a, b) =>
    new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime()
  );
}

export async function updateMessageContent(
  messageId: string,
  content: string
): Promise<void> {
  await base44.entities.Message.update(messageId, { content });
}

// ─── Session Persistence ──────────────────────────────────────────────────────

export async function loadActiveSession(projectId?: string): Promise<ConversationSession | null> {
  // Fase 3: limitado ao workspace ativo (resolvido no backend).
  const res: any = await base44.functions.invoke("conversationContext", {
    operation: "listSessions",
    projectId,
    limit: 1,
  });
  const data = res?.data ?? res;
  if (!data?.ok) return null;
  const arr = (data.sessions || []) as ConversationSession[];
  return arr.length > 0 ? arr[0] : null;
}

export async function createSession(
  title = "Nova conversa",
  projectId?: string
): Promise<ConversationSession> {
  // Fase 3: criacao via backend — workspace_id = workspace ativo do usuario,
  // validado por membership. Rejeita se nao houver workspace ativo valido.
  const res: any = await base44.functions.invoke("conversationContext", {
    operation: "createSession",
    title,
    projectId,
  });
  const data = res?.data ?? res;
  if (!data?.ok) throw new Error(data?.error || "Falha ao criar sessao");
  return data.session as ConversationSession;
}

export async function updateSession(
  sessionId: string,
  updates: Partial<ConversationSession>
): Promise<void> {
  await base44.entities.ChatSession.update(sessionId, updates);
}

export async function archiveSession(sessionId: string): Promise<void> {
  await base44.entities.ChatSession.update(sessionId, { status: "archived" });
}

export async function listSessions(limit = 20): Promise<ConversationSession[]> {
  // Fase 3: lista somente sessoes do workspace ativo (resolvido no backend).
  const res: any = await base44.functions.invoke("conversationContext", {
    operation: "listSessions",
    limit,
  });
  const data = res?.data ?? res;
  if (!data?.ok) return [];
  return (data.sessions || []) as ConversationSession[];
}

const LAST_SESSION_KEY_GLOBAL = "memoryos_last_session_id";

function lastSessionKey(projectId?: string): string {
  return projectId
    ? `memoryos_last_session_id__proj_${projectId}`
    : LAST_SESSION_KEY_GLOBAL;
}

export function saveLastSessionId(sessionId: string, projectId?: string): void {
  try { localStorage.setItem(lastSessionKey(projectId), sessionId); } catch {}
}
export function getLastSessionId(projectId?: string): string | null {
  try { return localStorage.getItem(lastSessionKey(projectId)); } catch { return null; }
}

export async function getOrCreateActiveSession(projectId?: string): Promise<ConversationSession> {
  // Fase 3: resolve no backend — restaura/cria a sessao ativa do workspace
  // ativo do usuario. O backend valida membership e rejeita sem workspace.
  const lastId = getLastSessionId(projectId);
  const res: any = await base44.functions.invoke("conversationContext", {
    operation: "resolveActiveSession",
    projectId,
    lastSessionId: lastId || undefined,
  });
  const data = res?.data ?? res;
  if (!data?.ok) throw new Error(data?.error || "Falha ao resolver sessao ativa");
  const session = data.session as ConversationSession;
  saveLastSessionId(session.id, projectId);
  return session;
}