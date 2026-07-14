/**
 * ConversationStore.ts — Central state management for the Conversation Platform
 * Single source of truth for all conversation state.
 * MDS v2.0 compliant
 */

import type {
  ConversationState,
  ConversationMessage,
  ConversationSession,
  ConversationStatus,
  ReasoningPhase,
  StreamSession,
  PipelineExecution,
  ConversationEvent,
  ConversationEventType,
} from "./CXPTypes";

type StateListener = (state: ConversationState) => void;
type EventListener = (event: ConversationEvent) => void;

// ─── Default State ────────────────────────────────────────────────────────────

function defaultState(): ConversationState {
  return {
    messages: [],
    session: null,
    status: "idle",
    reasoningPhase: "idle",
    streamSession: null,
    currentExecution: null,
    error: null,
    isInitialized: false,
  };
}

// ─── ConversationStore ────────────────────────────────────────────────────────

class ConversationStore {
  private _state: ConversationState = defaultState();
  private _listeners: Set<StateListener> = new Set();
  private _eventListeners: Map<string, Set<EventListener>> = new Map();
  private _eventHistory: ConversationEvent[] = [];

  // ── State Access ──────────────────────────────────────────────────────────

  get state(): ConversationState {
    return this._state;
  }

  get messages(): ConversationMessage[] {
    return this._state.messages;
  }

  get session(): ConversationSession | null {
    return this._state.session;
  }

  get status(): ConversationStatus {
    return this._state.status;
  }

  get isLoading(): boolean {
    return !["idle", "error"].includes(this._state.status);
  }

  // ── State Mutations ───────────────────────────────────────────────────────

  setSession(session: ConversationSession | null): void {
    this._patch({ session, isInitialized: session !== null });
  }

  setMessages(messages: ConversationMessage[]): void {
    this._patch({ messages });
  }

  appendMessage(message: ConversationMessage): void {
    this._patch({ messages: [...this._state.messages, message] });
  }

  updateMessage(id: string, updates: Partial<ConversationMessage>): void {
    const messages = this._state.messages.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    );
    this._patch({ messages });
  }

  setStatus(status: ConversationStatus): void {
    this._patch({ status, error: status !== "error" ? null : this._state.error });
  }

  setReasoningPhase(reasoningPhase: ReasoningPhase): void {
    this._patch({ reasoningPhase });
  }

  setError(error: string | null): void {
    this._patch({ error, status: error ? "error" : "idle" });
  }

  setStreamSession(streamSession: StreamSession | null): void {
    this._patch({ streamSession });
  }

  setCurrentExecution(currentExecution: PipelineExecution | null): void {
    this._patch({ currentExecution });
  }

  /** Update streaming content on the last assistant message */
  updateStreamingContent(token: string): void {
    const messages = [...this._state.messages];
    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
      const last = messages[lastIdx];
      messages[lastIdx] = {
        ...last,
        streamingContent: (last.streamingContent ?? "") + token,
        isStreaming: true,
      };
      this._patch({ messages });
    }
  }

  /** Finalize the streaming message — replace content with full streamed content */
  finalizeStreaming(messageId: string, finalContent: string): void {
    const messages = this._state.messages.map((m) =>
      m.id === messageId
        ? { ...m, content: finalContent, streamingContent: undefined, isStreaming: false }
        : m
    );
    this._patch({ messages, streamSession: null });
  }

  reset(): void {
    this._state = defaultState();
    this._notify();
  }

  // ── Subscribers ───────────────────────────────────────────────────────────

  subscribe(listener: StateListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  on(type: ConversationEventType | "*", listener: EventListener): () => void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set());
    }
    this._eventListeners.get(type)!.add(listener);
    return () => this._eventListeners.get(type)?.delete(listener);
  }

  emit(event: ConversationEvent): void {
    this._eventHistory.push(event);
    if (this._eventHistory.length > 500) this._eventHistory.shift();

    const specific = this._eventListeners.get(event.type);
    if (specific) specific.forEach((l) => l(event));

    const wildcard = this._eventListeners.get("*");
    if (wildcard) wildcard.forEach((l) => l(event));
  }

  getEventHistory(): ConversationEvent[] {
    return [...this._eventHistory];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _patch(partial: Partial<ConversationState>): void {
    this._state = { ...this._state, ...partial };
    this._notify();
  }

  private _notify(): void {
    this._listeners.forEach((l) => l(this._state));
  }
}

// ─── Singleton (globalThis anchored to survive HMR) ──────────────────────────

const _key = "__CXP_STORE__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationStore();
}

export const conversationStore: ConversationStore = (
  globalThis as unknown as Record<string, ConversationStore>
)[_key];

export { ConversationStore };