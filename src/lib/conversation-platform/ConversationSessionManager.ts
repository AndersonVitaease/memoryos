/**
 * ConversationSessionManager.ts
 * Manages session lifecycle: create, restore, archive, rename, close, switch, sync.
 * MDS v2.0 compliant
 */

import { conversationStore } from "./ConversationStore";
import { runtimeContextLayer } from "@/lib/runtime-context/RuntimeContextLayer";
import {
  getOrCreateActiveSession,
  loadMessages,
  updateSession,
  archiveSession,
  createSession,
  listSessions,
  saveLastSessionId,
} from "./ConversationPersistence";
import type { ConversationSession } from "./CXPTypes";

class ConversationSessionManager {
  // ── Initialize / Restore ──────────────────────────────────────────────────

  async initializeSession(projectId?: string): Promise<ConversationSession> {
    const existing = conversationStore.session;
    // Se já há sessão e mensagens carregadas em memória, não relê do banco.
    // Isso preserva o contexto durante HMR e re-renders.
    // Mas se há sessão sem mensagens (reload de página, contexto perdido),
    // sempre recarrega as mensagens do banco.
    if (existing && conversationStore.messages.length > 0) {
      return existing;
    }

    const session = await getOrCreateActiveSession(projectId);
    conversationStore.setSession(session);
    conversationStore.emit({
      type: "SESSION_RESTORED",
      sessionId: session.id,
      payload: { title: session.title, status: session.status },
      timestamp: Date.now(),
    });

    const messages = await loadMessages(session.id, 100);
    conversationStore.setMessages(messages);
    return session;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async createNewSession(title?: string, projectId?: string): Promise<ConversationSession> {
    const session = await createSession(title, projectId);
    saveLastSessionId(session.id, projectId);
    // BUGFIX (auditoria cognição): sem isto, o RuntimeContextLayer
    // (goalType/artefato/executionIntent/resultSet da última execução
    // de conector) permanecia vivo entre sessões — a sessão nova podia
    // "herdar" contexto de execução de uma conversa completamente
    // diferente assim que uma frase de continuidade fosse detectada.
    runtimeContextLayer.clear();
    conversationStore.setSession(session);
    conversationStore.setMessages([]);
    conversationStore.emit({
      type: "SESSION_CREATED",
      sessionId: session.id,
      payload: { title: session.title },
      timestamp: Date.now(),
    });
    return session;
  }

  // ── Switch ────────────────────────────────────────────────────────────────

  async switchSession(sessionId: string): Promise<void> {
    const sessions = await listSessions(50);
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) throw new Error(`Session not found: ${sessionId}`);

    // BUGFIX (auditoria cognição): mesmo motivo do createNewSession —
    // o contexto de execução (RuntimeContextLayer/ExecutionIntent) não
    // era escopado por sessão, então a conversa alvo podia herdar o
    // goalType/artefato da conversa de onde você estava saindo.
    runtimeContextLayer.clear();
    conversationStore.setSession(target);
    saveLastSessionId(sessionId);
    const messages = await loadMessages(sessionId, 100);
    conversationStore.setMessages(messages);
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  async renameSession(sessionId: string, title: string): Promise<void> {
    await updateSession(sessionId, { title });
    const current = conversationStore.session;
    if (current?.id === sessionId) {
      conversationStore.setSession({ ...current, title });
    }
  }

  // ── Sync summary / metadata ───────────────────────────────────────────────

  async syncSessionMetadata(
    sessionId: string,
    updates: Partial<ConversationSession>
  ): Promise<void> {
    await updateSession(sessionId, updates);
    const current = conversationStore.session;
    if (current?.id === sessionId) {
      conversationStore.setSession({ ...current, ...updates });
    }
  }

  // ── Archive / Close ───────────────────────────────────────────────────────

  async archiveCurrentSession(): Promise<void> {
    const session = conversationStore.session;
    if (!session) return;
    await archiveSession(session.id);
    conversationStore.setSession({ ...session, status: "archived" });
  }

  async close(): Promise<void> {
    conversationStore.reset();
  }

  // ── Auto-title ────────────────────────────────────────────────────────────

  async autoTitleIfNeeded(firstUserMessage: string): Promise<void> {
    const session = conversationStore.session;
    if (!session) return;
    if (session.title !== "Nova conversa") return;

    try {
      const { base44: sdk } = await import("@/api/base44Client");
      const result = await sdk.integrations.Core.InvokeLLM({
        prompt: `Crie um titulo curto (max 5 palavras) para uma conversa que comecou com:\n"${firstUserMessage}"\nResponda apenas o titulo.`,
      });
      const title = (result as string).trim().replace(/["']/g, "");
      await this.renameSession(session.id, title);
    } catch {
      // non-critical — title stays "Nova conversa"
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const _key = "__CXP_SESSION_MANAGER__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationSessionManager();
}

export const sessionManager: ConversationSessionManager = (
  globalThis as unknown as Record<string, ConversationSessionManager>
)[_key];

export { ConversationSessionManager };