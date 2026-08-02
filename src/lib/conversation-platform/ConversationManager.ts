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

// ─── Watch Management Interceptor ────────────────────────────────────────────
// Detecta comandos de gerenciamento de avisos: deletar, cancelar, listar.

async function tryManageWatches(
  userMessage: string,
  sessionId?: string
): Promise<string | null> {
  const msg = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Detectar intenção de deletar/cancelar avisos
  const isDeleteAll = /deletar?\s+(todos|tudo)|cancelar?\s+(todos|tudo)|remover?\s+(todos|tudo)|apagar?\s+(todos|tudo)/i.test(userMessage);
  const isDeleteOthers = /deletar?\s+(outros|demais)|cancelar?\s+(outros|demais)|remover?\s+(outros|demais)|manter\s+apenas|exceto\s+esse|apagar?\s+(outros|demais)/i.test(userMessage);
  const isDeleteSpecific = /deletar?|cancelar?|remover?|apagar?|excluir?/i.test(userMessage) && !isDeleteAll && !isDeleteOthers;

  // Extrair horário mencionado (para manter/deletar específico)
  const keepTimeMatch = /manter?\s+.*?(\d{1,2})[h:](\d{2})|apenas.*?(\d{1,2})[h:](\d{2})|exceto.*?(\d{1,2})[h:](\d{2})/i.exec(userMessage);
  const deleteTimeMatch = !isDeleteAll && !isDeleteOthers && /(\d{1,2})[h:](\d{2})/i.exec(userMessage);

  if (!isDeleteAll && !isDeleteOthers && !isDeleteSpecific) return null;
  // Só age se há alguma palavra de aviso/watch no contexto
  if (!/aviso|alerta|watch|lembrete|agendamento|horario|hrs/i.test(userMessage)) return null;

  const allActive = await (base44 as any).entities.Watch.filter({ status: "active" });
  if (!allActive.length) return "Nao ha avisos ativos para remover.";

  let toDelete: any[] = [];
  let toKeep: any[] = [];

  if (isDeleteAll) {
    toDelete = allActive;
  } else if (isDeleteOthers && keepTimeMatch) {
    const kh = (keepTimeMatch[1] ?? keepTimeMatch[3] ?? keepTimeMatch[5])?.padStart(2, "0");
    const km = (keepTimeMatch[2] ?? keepTimeMatch[4] ?? keepTimeMatch[6])?.padStart(2, "0");
    const keepTime = `${kh}:${km}`;
    toKeep = allActive.filter((w: any) => {
      try { const ct = JSON.parse(w.condition_tree); return ct.params?.target_time === keepTime; } catch { return false; }
    });
    toDelete = allActive.filter((w: any) => !toKeep.find((k: any) => k.id === w.id));
  } else if (isDeleteOthers) {
    // Sem horário específico: deletar todos exceto o mais recente
    toKeep = [allActive[0]];
    toDelete = allActive.slice(1);
  } else if (isDeleteSpecific && deleteTimeMatch) {
    const dh = String(parseInt(deleteTimeMatch[1], 10)).padStart(2, "0");
    const dm = String(parseInt(deleteTimeMatch[2], 10)).padStart(2, "0");
    const delTime = `${dh}:${dm}`;
    toDelete = allActive.filter((w: any) => {
      try { const ct = JSON.parse(w.condition_tree); return ct.params?.target_time === delTime; } catch { return false; }
    });
  }

  if (!toDelete.length) return "Nao encontrei avisos correspondentes para remover.";

  for (const w of toDelete) {
    await (base44 as any).entities.Watch.update(w.id, { status: "completed" });
  }

  const names = toDelete.map((w: any) => `\`${w.name.replace(/ — Auto WE-04$/, "")}\``).join(", ");
  const keepMsg = toKeep.length ? `\n\nMantido: ${toKeep.map((w: any) => `\`${w.name.replace(/ — Auto WE-04$/, "")}\``).join(", ")}` : "";
  return `Removido${toDelete.length > 1 ? "s" : ""}: ${names}${keepMsg}`;
}

// ─── Scheduled Email Interceptor ──────────────────────────────────────────────
// Detecta "Para: email" + horario HH:MMhrs em qualquer linha da mensagem.
// Retorna resposta imediata sem passar pelo pipeline cognitivo.

// Verifica se um horário "HH:MM" já passou há mais de 6 minutos (BRT)
function isPast(targetTime: string): boolean {
  const now = new Date();
  const hStr = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(now);
  const mStr = new Intl.DateTimeFormat("en-US", { minute: "numeric", timeZone: "America/Sao_Paulo" }).format(now);
  const nowMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const [th, tm] = targetTime.split(":").map(Number);
  const targetMin = th * 60 + tm;
  return nowMin - targetMin > 6;
}

async function tryScheduleEmail(
  userMessage: string,
  sessionId?: string,
  projectId?: string
): Promise<string | null> {
  const toMatch = /^para\s*:?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/im.exec(userMessage);
  const timeMatch = /\b(\d{1,2})[h:](\d{2})h?r?s?\b/i.exec(userMessage);
  // Precisa de horário; email é opcional
  if (!timeMatch) return null;
  // Se não tem email mas tem "me avise", trata como watch de notificação simples
  if (!toMatch) {
    const hasNotify = /\bme\s+avis[ea]\b/i.test(userMessage);
    if (!hasNotify) return null;
    const h = String(parseInt(timeMatch[1], 10)).padStart(2, "0");
    const m = String(parseInt(timeMatch[2], 10)).padStart(2, "0");
    const targetTime = `${h}:${m}`;
    console.log(`[CXP-SCHED] Aviso simples: ${targetTime}`);
    await (base44 as any).entities.Watch.create({
      name: `Aviso as ${targetTime}`,
      description: `Lembrete agendado via chat`,
      condition_tree: JSON.stringify({
        kind: "leaf", provider: "clock", action: "check_time",
        params: { target_time: targetTime }, result_path: "count", comparator: "gt", value: 0,
      }),
      frequency_minutes: 1,
      priority: "high",
      status: "active",
      on_trigger_type: "notify_user",
      on_trigger_payload: null,
      last_evaluation_result: null,
      consecutive_failures: 0,
      trigger_count: 0,
      next_execution_at: new Date().toISOString(),
      compiled_at: new Date().toISOString(),
      session_id: sessionId,
      project_id: projectId,
      status: isPast(targetTime) ? "completed" : "active",
      });
      if (isPast(targetTime)) return `Esse horario (${targetTime}) ja passou — aviso nao criado. Tente um horario futuro.`;
      return `Ok! Vou te avisar aqui no chat as **${targetTime}**.`;
  }

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

  // Verificar se também foi pedido aviso no chat
  const hasNotifyRequest = /\bme\s+avis[ea]\b/i.test(userMessage);

  console.log(`[CXP-SCHED] Watch criado: ${record.id}`);

  if (isPast(targetTime)) return `Esse horario (${targetTime}) ja passou — agendamento nao criado. Tente um horario futuro.`;

  if (hasNotifyRequest) {
    return `Agendado! As **${targetTime}** vou:\n1. Te avisar aqui no chat\n2. Enviar o email para \`${to}\``;
  }
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

    // Interceptar gerenciamento de avisos (deletar/cancelar)
    const session = conversationStore.session;
    const manageResponse = await tryManageWatches(msg, session?.id).catch(() => null);
    if (manageResponse) {
      const { base44: b44 } = await import("@/api/base44Client");
      const userMsg = await (b44 as any).entities.Message.create({ session_id: session?.id, role: "user", content: msg, memory_tier: "active" });
      conversationStore.appendMessage(userMsg);
      const assistantMsg = await (b44 as any).entities.Message.create({ session_id: session?.id, role: "assistant", content: manageResponse, memory_tier: "active" });
      conversationStore.appendMessage(assistantMsg);
      return;
    }

    // Interceptar agendamento de email antes do pipeline cognitivo
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
const _currentVer = "cxp-sched-v2";
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g[_key] || _g[_ver] !== _currentVer) {
  _g[_key] = new ConversationManager();
  _g[_ver] = _currentVer;
}

export const conversationManager: ConversationManager = (
  globalThis as unknown as Record<string, ConversationManager>
)[_key];

export { ConversationManager };