Segundo arquivo: `ConversationSessionManager.ts`.

**Endereço no GitHub** (mesmo padrão do anterior, troca `blob` por `edit`):
👉 **https://github.com/AndersonVitaease/memoryos/edit/main/src/lib/conversation-platform/ConversationSessionManager.ts**

Mesma recomendação de antes: antes de colar por cima, dá uma olhada rápida na versão atual desse arquivo no GitHub (aba "Code", não "Raw") pra ver se bate com o que eu tenho — o zip pode estar um pouco atrás do que está lá.

**Conteúdo completo pra copiar (Ctrl+A dentro do editor → colar isto por cima):**

```typescript
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
} from "./ConversationPersistence";
import type { ConversationSession } from "./CXPTypes";

class ConversationSessionManager {
  // ── Initialize / Restore ──────────────────────────────────────────────────

  async initializeSession(): Promise<ConversationSession> {
    const session = await getOrCreateActiveSession();
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

  async createNewSession(title?: string): Promise<ConversationSession> {
    const session = await createSession(title);
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
```

**Commit message sugerida:**

```
fix(IA-044): RuntimeContextLayer não era limpo ao trocar/criar sessão

ConversationStore.setConnectorContext() documenta o contexto como
"scoped to the current session — never shared across sessions", mas
isso não era verdade: connectorContexts é um mapa achatado por
connectorId, sem sessionId na chave, e ExecutionIntentManager também
não tem nenhum campo de sessão ou expiração por tempo.

reset() (que limpa esse estado) só era chamado em close(). Nem
createNewSession() nem switchSession() chamavam. Resultado: o
goalType/artefato/resultSet da última execução de conector
continuava vivo ao trocar de conversa, e podia ser "herdado" por
uma sessão totalmente diferente assim que uma frase de continuidade
fosse detectada (ver IA-043).

Mudança: runtimeContextLayer.clear() agora roda no início de
createNewSession() e switchSession().
```
