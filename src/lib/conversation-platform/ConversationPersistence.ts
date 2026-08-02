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
  const saved = await base44.entities.Message.create({
    session_id: params.sessionId,
    project_id: params.projectId,
    role: params.role,
    content: params.content,
    memory_tier: params.memory_tier ?? "active",
    sources_used: params.sources_used ?? [],
  });

  // Incrementa message_count e atualiza last_message_at na sessão (fire-and-forget)
  base44.entities.ChatSession.updateMany(
    { id: params.sessionId },
    { $inc: { message_count: 1 }, $currentDate: { last_message_at: true } }
  ).catch(() => {});

  return saved as ConversationMessage;
}

export async function loadMessages(
  sessionId: string,
  limit = 100
): Promise<ConversationMessage[]> {
  const msgs = await base44.entities.Message.filter(
    { session_id: sessionId },
    "created_date",
    limit
  );
  return msgs as ConversationMessage[];
}

export async function updateMessageContent(
  messageId: string,
  content: string
): Promise<void> {
  await base44.entities.Message.update(messageId, { content });
}

// ─── Session Persistence ──────────────────────────────────────────────────────

export async function loadActiveSession(): Promise<ConversationSession | null> {
  const sessions = await base44.entities.ChatSession.filter(
    { status: "active" },
    "-last_message_at",
    1
  );
  return sessions.length > 0 ? (sessions[0] as ConversationSession) : null;
}

export async function createSession(title = "Nova conversa"): Promise<ConversationSession> {
  const session = await base44.entities.ChatSession.create({
    title,
    status: "active",
    message_count: 0,
  });
  return session as ConversationSession;
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
  const sessions = await base44.entities.ChatSession.list("-last_message_at", limit);
  return sessions as ConversationSession[];
}

export async function getOrCreateActiveSession(): Promise<ConversationSession> {
  // Busca todas as sessões ativas e escolhe a que tem last_message_at mais recente.
  // Ignorar sessões vazias (message_count = 0 e last_message_at nulo) que ficam
  // penduradas sem mensagens — elas aparecem no topo quando sorted por -last_message_at
  // com null, causando perda de contexto a cada reload.
  const sessions = await base44.entities.ChatSession.filter(
    { status: "active" },
    "-last_message_at",
    10
  );
  const withMessages = (sessions as ConversationSession[]).filter(
    (s) => s.message_count && s.message_count > 0 && s.last_message_at
  );
  if (withMessages.length > 0) return withMessages[0];
  // Nenhuma sessão com mensagens — usa qualquer ativa existente ou cria nova
  if (sessions.length > 0) return sessions[0] as ConversationSession;
  return createSession();
}