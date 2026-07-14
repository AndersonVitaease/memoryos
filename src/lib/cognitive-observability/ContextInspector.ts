/**
 * ContextInspector.ts — Context Inspector
 * Sprint 7.1.1: Records every item that enters the context window.
 */

import type {
  ContextItem,
  ContextSnapshot,
} from "./COPTypes";

let _nextOrder = 0;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class ContextInspector {
  private static _instance: ContextInspector | null = null;
  private _snapshots: Map<string, ContextSnapshot> = new Map(); // keyed by messageId

  static getInstance(): ContextInspector {
    if (!ContextInspector._instance) {
      ContextInspector._instance = new ContextInspector();
    }
    return ContextInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startCapture(conversationId: string, messageId: string): void {
    _nextOrder = 0;
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      totalItems: 0,
      totalTokensEstimate: 0,
      items: [],
    });
  }

  addItem(
    messageId: string,
    item: Omit<ContextItem, "id" | "order">
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const full: ContextItem = {
      ...item,
      id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      order: _nextOrder++,
    };
    snap.items.push(full);
    snap.totalItems = snap.items.length;
    snap.totalTokensEstimate += estimateTokens(item.content);
  }

  addMessages(
    messageId: string,
    messages: Array<{ role: string; content: string }>,
    reason = "Recent conversation context"
  ): void {
    messages.forEach((m, i) => {
      this.addItem(messageId, {
        type: "message",
        label: `${m.role === "user" ? "User" : "Assistant"} message`,
        content: m.content,
        weight: 1.0 - i * 0.05,
        reason,
        timestamp: new Date().toISOString(),
      });
    });
  }

  addSummary(
    messageId: string,
    summary: string,
    reason = "Session summary provides long-term context"
  ): void {
    this.addItem(messageId, {
      type: "summary",
      label: "Session Summary",
      content: summary,
      weight: 0.9,
      reason,
    });
  }

  addEntities(
    messageId: string,
    entities: Array<{ type: string; value: string; context?: string }>
  ): void {
    entities.forEach((e) => {
      this.addItem(messageId, {
        type: "entity",
        label: `Entity: ${e.type}`,
        content: `${e.value}${e.context ? ` — ${e.context}` : ""}`,
        weight: 0.7,
        reason: "Named entity relevant to conversation",
      });
    });
  }

  addMemoryItems(
    messageId: string,
    items: Array<{ label: string; content: string; source: string }>
  ): void {
    items.forEach((m) => {
      this.addItem(messageId, {
        type: "memory",
        label: m.label,
        content: m.content,
        weight: 0.8,
        reason: "Long-term memory retrieved for context",
        source: m.source,
      });
    });
  }

  addSpecialistResult(
    messageId: string,
    name: string,
    result: string
  ): void {
    this.addItem(messageId, {
      type: "specialist",
      label: `Specialist: ${name}`,
      content: result,
      weight: 0.85,
      reason: `Specialist ${name} was activated and contributed context`,
    });
  }

  addConnectorResult(
    messageId: string,
    connectorName: string,
    capability: string,
    result: string
  ): void {
    this.addItem(messageId, {
      type: "connector_result",
      label: `${connectorName} — ${capability}`,
      content: result,
      weight: 0.75,
      reason: "External connector data retrieved for context",
      source: connectorName,
    });
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): ContextSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): ContextSnapshot | null {
    const all = Array.from(this._snapshots.values());
    if (!all.length) return null;
    return all[all.length - 1];
  }

  listAll(): ContextSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
    _nextOrder = 0;
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      avgItemsPerSnapshot:
        all.length > 0
          ? Math.round(all.reduce((s, x) => s + x.totalItems, 0) / all.length)
          : 0,
      avgTokensPerSnapshot:
        all.length > 0
          ? Math.round(
              all.reduce((s, x) => s + x.totalTokensEstimate, 0) / all.length
            )
          : 0,
    };
  }
}