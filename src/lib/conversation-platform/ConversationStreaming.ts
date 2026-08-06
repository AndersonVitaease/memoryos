/**
 * ConversationStreaming.ts
 * Simulated streaming: progressively reveals LLM response token by token.
 * Real streaming infrastructure ready for SSE / WebSocket / chunked response.
 * MDS v2.0 compliant
 */

import { conversationStore } from "./ConversationStore";
import type { StreamSession, StreamChunk } from "./CXPTypes";

// ─── Streaming Engine ─────────────────────────────────────────────────────────

class ConversationStreaming {
  private _active: Map<string, { cancelled: boolean }> = new Map();

  /**
   * Stream a complete response token by token.
   * Simulates real streaming by splitting on word boundaries.
   * Real SSE/WebSocket integration replaces this body — API stays the same.
   */
  async streamResponse(params: {
    executionId: string;
    messageId: string;
    fullContent: string;
    onChunk?: (chunk: StreamChunk) => void;
    onDone?: (fullContent: string) => void;
  }): Promise<void> {
    const { executionId, messageId, fullContent, onChunk, onDone } = params;

    const streamSession: StreamSession = {
      executionId,
      state: "starting",
      startedAt: Date.now(),
      totalTokens: 0,
      fullContent: "",
    };

    const ctrl = { cancelled: false };
    this._active.set(executionId, ctrl);

    conversationStore.setStreamSession({ ...streamSession, state: "streaming" });
    conversationStore.emit({
      type: "STREAM_STARTED",
      executionId,
      timestamp: Date.now(),
    });

    // Split into "tokens" — words + spaces for natural feel
    const tokens = this._tokenize(fullContent);
    let accumulated = "";
    let index = 0;
    const firstTokenAt = Date.now();

    for (const token of tokens) {
      if (ctrl.cancelled) break;

      accumulated += token;

      // Update streaming content on the placeholder message
      conversationStore.updateStreamingContent(token);

      const chunk: StreamChunk = {
        executionId,
        index: index++,
        token,
        accumulated,
        timestamp: Date.now(),
      };

      onChunk?.(chunk);

      conversationStore.emit({
        type: "TOKEN_RECEIVED",
        executionId,
        payload: chunk,
        timestamp: Date.now(),
      });

      // Variable delay — perceptible but fast. Antes era 28-55ms por token,
      // o que fazia uma resposta de 300 tokens demorar ~12s só pra aparecer.
      // Reduzido pra a resposta aparecer ~4x mais rapido mantendo o efeito.
      const len = token.trim().length;
      const delay = len > 8 ? 14 : len > 4 ? 10 : 6;
      await this._sleep(delay);
    }

    if (ctrl.cancelled) {
      this._active.delete(executionId);
      return;
    }

    // Finalize
    const finishedAt = Date.now();
    const durationMs = finishedAt - (streamSession.startedAt ?? finishedAt);
    const tokensPerSecond = index / Math.max(durationMs / 1000, 0.1);

    conversationStore.finalizeStreaming(messageId, accumulated);
    conversationStore.setStreamSession({
      ...streamSession,
      state: "finished",
      firstTokenAt,
      finishedAt,
      totalTokens: index,
      tokensPerSecond,
      fullContent: accumulated,
    });

    conversationStore.emit({
      type: "STREAM_FINISHED",
      executionId,
      payload: { totalTokens: index, tokensPerSecond, durationMs },
      timestamp: Date.now(),
    });

    onDone?.(accumulated);
    this._active.delete(executionId);
  }

  cancel(executionId: string): void {
    const ctrl = this._active.get(executionId);
    if (ctrl) ctrl.cancelled = true;
  }

  isStreaming(executionId: string): boolean {
    return this._active.has(executionId);
  }

  // ── Tokenizer ─────────────────────────────────────────────────────────────

  /**
   * Splits text into streaming tokens.
   * Words, punctuation, and whitespace are individual tokens.
   * Future: replace with real SSE chunk handler.
   */
  private _tokenize(text: string): string[] {
    // Split into words with their trailing whitespace preserved
    const tokens: string[] = [];
    const regex = /(\S+\s*)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      tokens.push(match[1]);
    }
    return tokens;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Future: Real SSE Streaming ────────────────────────────────────────────

  /**
   * Future implementation: consume SSE stream from API.
   * Infrastructure is ready — replace _tokenize with real chunk reader.
   */
  async connectSSE(_url: string, _executionId: string): Promise<void> {
    throw new Error("SSE streaming not yet implemented — planned for realtime upgrade");
  }

  /**
   * Future implementation: consume WebSocket stream.
   */
  async connectWebSocket(_url: string, _executionId: string): Promise<void> {
    throw new Error("WebSocket streaming not yet implemented — planned for realtime upgrade");
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const _key = "__CXP_STREAMING__";
if (!(globalThis as unknown as Record<string, unknown>)[_key]) {
  (globalThis as unknown as Record<string, unknown>)[_key] = new ConversationStreaming();
}

export const conversationStreaming: ConversationStreaming = (
  globalThis as unknown as Record<string, ConversationStreaming>
)[_key];

export { ConversationStreaming };