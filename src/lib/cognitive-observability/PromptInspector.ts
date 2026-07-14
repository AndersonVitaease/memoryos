/**
 * PromptInspector.ts — Prompt Inspector
 * Sprint 7.1.1: Captures the final prompt sent to the model, block by block.
 */

import type { PromptBlock, PromptSnapshot } from "./COPTypes";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class PromptInspector {
  private static _instance: PromptInspector | null = null;
  private _snapshots: Map<string, PromptSnapshot> = new Map();

  static getInstance(): PromptInspector {
    if (!PromptInspector._instance) {
      PromptInspector._instance = new PromptInspector();
    }
    return PromptInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startCapture(
    conversationId: string,
    messageId: string,
    model = "automatic"
  ): void {
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      model,
      totalTokens: 0,
      totalChars: 0,
      blocks: [],
      finalPrompt: "",
    });
  }

  addBlock(
    messageId: string,
    block: Omit<PromptBlock, "id" | "tokenEstimate" | "charCount">
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const full: PromptBlock = {
      ...block,
      id: `pb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tokenEstimate: estimateTokens(block.content),
      charCount: block.content.length,
    };
    snap.blocks.push(full);
    snap.totalTokens += full.tokenEstimate;
    snap.totalChars += full.charCount;
  }

  addSystemPrompt(messageId: string, content: string): void {
    this.addBlock(messageId, {
      label: "System Prompt",
      role: "system",
      content,
      order: 0,
    });
  }

  addConversationHistory(
    messageId: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>
  ): void {
    const content = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");
    this.addBlock(messageId, {
      label: "Conversation History",
      role: "context",
      content,
      order: 1,
    });
  }

  addMemoryBlock(messageId: string, content: string): void {
    this.addBlock(messageId, {
      label: "Memory Context",
      role: "context",
      content,
      order: 2,
    });
  }

  addKnowledgeBlock(messageId: string, content: string): void {
    this.addBlock(messageId, {
      label: "Knowledge Base",
      role: "context",
      content,
      order: 3,
    });
  }

  addSpecialistsBlock(messageId: string, content: string): void {
    this.addBlock(messageId, {
      label: "Specialist Results",
      role: "context",
      content,
      order: 4,
    });
  }

  addConnectorResultsBlock(messageId: string, content: string): void {
    this.addBlock(messageId, {
      label: "Connector Results",
      role: "context",
      content,
      order: 5,
    });
  }

  addUserPrompt(messageId: string, content: string): void {
    this.addBlock(messageId, {
      label: "User Prompt",
      role: "user",
      content,
      order: 6,
    });
  }

  finalizePrompt(messageId: string): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const sorted = [...snap.blocks].sort((a, b) => a.order - b.order);
    snap.finalPrompt = sorted
      .map((b) => `[${b.label.toUpperCase()}]\n${b.content}`)
      .join("\n\n---\n\n");
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): PromptSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): PromptSnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): PromptSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      avgTokens:
        all.length > 0
          ? Math.round(all.reduce((s, x) => s + x.totalTokens, 0) / all.length)
          : 0,
      maxTokens: all.reduce((m, x) => Math.max(m, x.totalTokens), 0),
    };
  }
}