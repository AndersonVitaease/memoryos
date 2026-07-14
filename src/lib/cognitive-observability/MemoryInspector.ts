/**
 * MemoryInspector.ts — Memory Inspector
 * Sprint 7.1.1: Captures the memory state for each message.
 */

import type { MemoryItem, MemorySnapshot, MemoryTier } from "./COPTypes";

export class MemoryInspector {
  private static _instance: MemoryInspector | null = null;
  private _snapshots: Map<string, MemorySnapshot> = new Map();

  static getInstance(): MemoryInspector {
    if (!MemoryInspector._instance) {
      MemoryInspector._instance = new MemoryInspector();
    }
    return MemoryInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startCapture(conversationId: string, messageId: string): void {
    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      items: [],
      totalItems: 0,
      byTier: { working: 0, long_term: 0, conversation: 0, knowledge: 0 },
    });
  }

  addItem(
    messageId: string,
    item: Omit<MemoryItem, "id">
  ): void {
    const snap = this._snapshots.get(messageId);
    if (!snap) return;
    const full: MemoryItem = {
      ...item,
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    snap.items.push(full);
    snap.totalItems = snap.items.length;
    snap.byTier[item.tier] = (snap.byTier[item.tier] ?? 0) + 1;
  }

  addDecisions(
    messageId: string,
    decisions: Array<{ title: string; description: string; source: string; date: string }>
  ): void {
    decisions.forEach((d) => {
      this.addItem(messageId, {
        tier: "long_term",
        type: "decision",
        label: d.title,
        content: d.description,
        source: d.source,
        confidence: 0.9,
        createdAt: d.date,
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
      });
    });
  }

  addTasks(
    messageId: string,
    tasks: Array<{ title: string; description: string; status: string }>
  ): void {
    tasks.forEach((t) => {
      this.addItem(messageId, {
        tier: "working",
        type: "task",
        label: t.title,
        content: `${t.description} [${t.status}]`,
        source: "task_manager",
        confidence: 1.0,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
      });
    });
  }

  addEntities(
    messageId: string,
    entities: Array<{ type: string; value: string; context?: string }>
  ): void {
    entities.forEach((e) => {
      this.addItem(messageId, {
        tier: "conversation",
        type: "entity",
        label: `${e.type}: ${e.value}`,
        content: e.context ?? e.value,
        source: "entity_extractor",
        confidence: 0.85,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
      });
    });
  }

  addKnowledge(
    messageId: string,
    docs: Array<{ name: string; summary: string; source: string }>
  ): void {
    docs.forEach((d) => {
      this.addItem(messageId, {
        tier: "knowledge",
        type: "document",
        label: d.name,
        content: d.summary,
        source: d.source,
        confidence: 0.8,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 1,
      });
    });
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): MemorySnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): MemorySnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): MemorySnapshot[] {
    return Array.from(this._snapshots.values());
  }

  getByTier(messageId: string, tier: MemoryTier): MemoryItem[] {
    const snap = this._snapshots.get(messageId);
    if (!snap) return [];
    return snap.items.filter((i) => i.tier === tier);
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      avgItemsPerSnapshot:
        all.length > 0
          ? Math.round(all.reduce((s, x) => s + x.totalItems, 0) / all.length)
          : 0,
    };
  }
}