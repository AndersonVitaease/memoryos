/**
 * EventReplay.ts — Event Replay Engine
 * Sprint 7.1.1: Logs every internal event and allows step-by-step replay.
 */

import type { ReplayEvent, EventLog } from "./COPTypes";

export class EventReplay {
  private static _instance: EventReplay | null = null;
  private _logs: Map<string, EventLog> = new Map();

  static getInstance(): EventReplay {
    if (!EventReplay._instance) {
      EventReplay._instance = new EventReplay();
    }
    return EventReplay._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  initLog(conversationId: string): void {
    if (!this._logs.has(conversationId)) {
      this._logs.set(conversationId, {
        conversationId,
        events: [],
        totalEvents: 0,
        capturedAt: new Date().toISOString(),
      });
    }
  }

  emit(
    conversationId: string,
    type: string,
    category: ReplayEvent["category"],
    payload: unknown,
    messageId?: string
  ): void {
    this.initLog(conversationId);
    const log = this._logs.get(conversationId)!;
    const event: ReplayEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      category,
      payload,
      timestamp: Date.now(),
      conversationId,
      messageId,
    };
    log.events.push(event);
    log.totalEvents = log.events.length;
  }

  // ── Convenience emitters ────────────────────────────────────────────────────

  emitPipeline(conversationId: string, messageId: string, stage: string, status: string, durationMs?: number): void {
    this.emit(conversationId, `pipeline.${stage}.${status}`, "pipeline", { stage, status, durationMs }, messageId);
  }

  emitMemory(conversationId: string, messageId: string, action: string, itemCount: number): void {
    this.emit(conversationId, `memory.${action}`, "memory", { action, itemCount }, messageId);
  }

  emitSpecialist(conversationId: string, messageId: string, name: string, activated: boolean, durationMs?: number): void {
    this.emit(conversationId, `specialist.${activated ? "activated" : "discarded"}`, "specialist", { name, activated, durationMs }, messageId);
  }

  emitConnector(conversationId: string, messageId: string, connectorName: string, capability: string, status: string): void {
    this.emit(conversationId, `connector.${status}`, "connector", { connectorName, capability, status }, messageId);
  }

  emitStreaming(conversationId: string, messageId: string, event: string, data: unknown): void {
    this.emit(conversationId, `streaming.${event}`, "streaming", data, messageId);
  }

  emitDecision(conversationId: string, messageId: string, category: string, decision: string): void {
    this.emit(conversationId, `decision.${category}`, "decision", { category, decision }, messageId);
  }

  emitSystem(conversationId: string, event: string, data: unknown): void {
    this.emit(conversationId, `system.${event}`, "system", data);
  }

  // ── Replay API ──────────────────────────────────────────────────────────────

  getLog(conversationId: string): EventLog | null {
    return this._logs.get(conversationId) ?? null;
  }

  getEventsForMessage(conversationId: string, messageId: string): ReplayEvent[] {
    const log = this._logs.get(conversationId);
    if (!log) return [];
    return log.events.filter((e) => e.messageId === messageId);
  }

  getEventsByCategory(
    conversationId: string,
    category: ReplayEvent["category"]
  ): ReplayEvent[] {
    const log = this._logs.get(conversationId);
    if (!log) return [];
    return log.events.filter((e) => e.category === category);
  }

  replayFrom(
    conversationId: string,
    fromTimestamp: number,
    toTimestamp?: number
  ): ReplayEvent[] {
    const log = this._logs.get(conversationId);
    if (!log) return [];
    return log.events.filter(
      (e) =>
        e.timestamp >= fromTimestamp &&
        (toTimestamp == null || e.timestamp <= toTimestamp)
    );
  }

  listConversations(): string[] {
    return Array.from(this._logs.keys());
  }

  clear(): void {
    this._logs.clear();
  }

  clearConversation(conversationId: string): void {
    this._logs.delete(conversationId);
  }

  stats() {
    const logs = Array.from(this._logs.values());
    return {
      totalConversations: logs.length,
      totalEvents: logs.reduce((s, l) => s + l.totalEvents, 0),
      avgEventsPerConversation:
        logs.length > 0
          ? Math.round(logs.reduce((s, l) => s + l.totalEvents, 0) / logs.length)
          : 0,
    };
  }
}