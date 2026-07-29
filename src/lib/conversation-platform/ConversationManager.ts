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

  async send(userMessage: string): Promise<void> {
    const msg = userMessage.trim();
    if (!msg) return;
    if (conversationPipeline.isRunning) return;
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
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationManager();
}

export const conversationManager: ConversationManager = (
  globalThis as unknown as Record<string, ConversationManager>
)[_key];

export { ConversationManager };
