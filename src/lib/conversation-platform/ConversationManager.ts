/**
 * ConversationManager.ts
 * Single public API for the Conversation Experience Platform.
 * ChatPage only calls this — never the internals directly.
 * MDS v2.0 compliant
 */

import { conversationStore } from "./ConversationStore";
import { conversationPipeline } from "./ConversationPipeline";
import { sessionManager } from "./ConversationSessionManager";
import { conversationMetrics } from "./ConversationMetrics";
import { conversationRecovery } from "./ConversationRecovery";
import type { ConversationState, ConversationEventType, ConversationEvent, ConversationMessage } from "./CXPTypes";
import { base44 } from "@/api/base44Client";

// ─── Scheduled Email Interceptor ──────────────────────────────────────────────
// Detecta "Para: email" + horario HH:MMhrs em qualquer linha da mensagem.
// Retorna resposta imediata sem passar pelo pipeline cognitivo.

async function tryScheduleEmail(
  userMessage: string,
  sessionId?: string,
  projectId?: string
): Promise<string | null> {
  const toMatch = /^para\s*:?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/im.exec(userMessage);
  const timeMatch = /\b(\d{1,2})[h:](\d{2})h?r?s?\b/i.exec(userMessage);
  if (!toMatch || !timeMatch) return null;

  const h = String(parseInt(timeMatch[1], 10)).padStart(2, "0");
  const m = String(parseInt(timeMatch[2], 10)).padStart(2, "0");
  const targetTime = `${h}:${m}`;
  const to = toMatch[1].trim();

  const fromMatch = /^(?:de|from)\s*:?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/im.exec(userMessage);
  const from = fromMatch?.[1]?.trim() || null;
  const subjMatch = /^(?:assunto|subject)\s*:?\s*(.+)/im.exec(userMessage);
  const subject = subjMatch?.[1]?.trim().split("\n")[0] || "Mensagem agendada";

  const subjLineIdx = userMessage.split("\n").findIndex(l => /^(?:assunto|subject)\s*:/i.test(l.trim()));
  const bodyLines = subjLineIdx >= 0
    ? userMessage.split("\n").slice(subjLineIdx + 1).filter(l => {
        const lt = l.trim().toLowerCase();
        return lt.length > 0
          && !lt.startsWith("nao foram") && !lt.startsWith("nao ha")
          && !lt.startsWith("nao ha") && !lt.startsWith("chegou")
          && !lt.startsWith("horario") && !lt.startsWith("horário")
          && !lt.startsWith("nao") && !lt.startsWith("nao") && !lt.startsWith("⏰")
          && !lt.startsWith("não");
      })
    : [];
  const body = bodyLines.length > 0 ? bodyLines.join("\n").trim() : subject;

  console.log(`[CXP-SCHED] Interceptado: ${targetTime} → ${to}`);

  const record = await (base44 as any).entities.Watch.create({
    name: `Email as ${targetTime} para ${to}`,
    description: `Agendado via chat`,
    condition_tree: JSON.stringify({
      kind: "leaf", provider: "clock", action: "check_time",
      params: { target_time: targetTime }, result_path: "count", comparator: "gt", value: 0,
    }),
    frequency_minutes: 1,
    priority: "high",
    status: "active",
    on_trigger_type: "emit_event",
    on_trigger_payload: JSON.stringify({ type: "send_email", email: { from, to, subject, body } }),
    last_evaluation_result: null,
    consecutive_failures: 0,
    trigger_count: 0,
    next_execution_at: new Date().toISOString(),
    compiled_at: new Date().toISOString(),
    session_id: sessionId,
    project_id: projectId,
  });

  console.log(`[CXP-SCHED] Watch criado: ${record.id}`);
  return `Agendado! Email para \`${to}\` sera enviado as **${targetTime}**.`;
}

type StateListener = (state: ConversationState) => void;
type EventListener = (event: ConversationEvent) => void;

// ─── ConversationManager ──────────────────────────────────────────────────────

class ConversationManager {
  // ── Initialization ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (conversationStore.state.isInitialized) return;
    await sessionManager.initializeSession();
  }

  // ── Send / Stop / Retry / Cancel ──────────────────────────────────────────

  appendMessage(message: ConversationMessage): void {
    conversationStore.appendMessage(message);
  }

  setMessages(messages: ConversationMessage[]): void {
    conversationStore.setMessages(messages);
  }

  async send(userMessage: string): Promise<void> {
    const msg = userMessage.trim();
    if (!msg) return;
    if (conversationPipeline.isRunning) return;

    // Interceptar agendamento de email antes do pipeline cognitivo
    const session = conversationStore.session;
    const schedResponse = await tryScheduleEmail(msg, session?.id, (session as any)?.project_id).catch(() => null);
    if (schedResponse) {
      // Persiste user + assistant direto, sem passar pelo pipeline
      const { base44: b44 } = await import("@/api/base44Client");
      const userMsg = await (b44 as any).entities.Message.create({
        session_id: session?.id,
        role: "user",
        content: msg,
        memory_tier: "active",
      });
      conversationStore.appendMessage(userMsg);
      const assistantMsg = await (b44 as any).entities.Message.create({
        session_id: session?.id,
        role: "assistant",
        content: schedResponse,
        memory_tier: "active",
      });
      conversationStore.appendMessage(assistantMsg);
      return;
    }

    await conversationPipeline.send(msg);
  }

  stop(): void {
    conversationPipeline.cancel();
  }

  cancel(): void {
    conversationPipeline.cancel();
  }

  async retry(userMessage: string): Promise<void> {
    await conversationPipeline.retry(userMessage);
  }

  // ── State Access ──────────────────────────────────────────────────────────

  get state(): ConversationState {
    return conversationStore.state;
  }

  get messages() {
    return conversationStore.messages;
  }

  get session() {
    return conversationStore.session;
  }

  get isLoading(): boolean {
    return conversationStore.isLoading;
  }

  get status() {
    return conversationStore.status;
  }

  get reasoningPhase() {
    return conversationStore.state.reasoningPhase;
  }

  get streamSession() {
    return conversationStore.state.streamSession;
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  subscribe(listener: StateListener): () => void {
    return conversationStore.subscribe(listener);
  }

  on(type: ConversationEventType | "*", listener: EventListener): () => void {
    return conversationStore.on(type, listener);
  }

  // ── Session Management ────────────────────────────────────────────────────

  async newSession(title?: string) {
    return sessionManager.createNewSession(title);
  }

  async switchSession(sessionId: string) {
    return sessionManager.switchSession(sessionId);
  }

  async renameSession(sessionId: string, title: string) {
    return sessionManager.renameSession(sessionId, title);
  }

  async archiveCurrentSession() {
    return sessionManager.archiveCurrentSession();
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  getMetrics() {
    return conversationMetrics.summary();
  }

  getDetailedMetrics() {
    return conversationMetrics.getLast(20);
  }

  getRecoveryHistory() {
    return conversationRecovery.getHistory();
  }

  getEventHistory() {
    return conversationStore.getEventHistory();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const _key = "__CXP_MANAGER__";
const _ver = "__CXP_MANAGER_VER__";
const _currentVer = "cxp-sched-v1";
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g[_key] || _g[_ver] !== _currentVer) {
  _g[_key] = new ConversationManager();
  _g[_ver] = _currentVer;
}

export const conversationManager: ConversationManager = (
  globalThis as unknown as Record<string, ConversationManager>
)[_key];

export { ConversationManager };