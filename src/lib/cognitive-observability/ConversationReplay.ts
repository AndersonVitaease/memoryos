/**
 * ConversationReplay.ts — Conversation Replay Engine
 * Sprint 7.1.1: Assembles full conversation replay frames from all inspectors.
 */

import type {
  ConversationReplay as ConversationReplayT,
  ConversationReplayFrame,
  ObservationRecord,
} from "./COPTypes";
import { ContextInspector } from "./ContextInspector";
import { PromptInspector } from "./PromptInspector";
import { PipelineTimelineInspector } from "./PipelineTimeline";
import { StreamingInspector } from "./StreamingInspector";
import { MemoryInspector } from "./MemoryInspector";
import { SpecialistInspector } from "./SpecialistInspector";
import { ConnectorInspector } from "./ConnectorInspector";
import { DecisionInspector } from "./DecisionInspector";
import { PerformanceTimeline } from "./PerformanceTimeline";
import { EventReplay } from "./EventReplay";

export class ConversationReplayEngine {
  private static _instance: ConversationReplayEngine | null = null;
  private _records: Map<string, ObservationRecord[]> = new Map(); // keyed by conversationId

  static getInstance(): ConversationReplayEngine {
    if (!ConversationReplayEngine._instance) {
      ConversationReplayEngine._instance = new ConversationReplayEngine();
    }
    return ConversationReplayEngine._instance;
  }

  // ── Assemble ────────────────────────────────────────────────────────────────

  assembleRecord(
    conversationId: string,
    messageId: string,
    userInput: string
  ): ObservationRecord {
    const ctx = ContextInspector.getInstance();
    const prompt = PromptInspector.getInstance();
    const pipeline = PipelineTimelineInspector.getInstance();
    const streaming = StreamingInspector.getInstance();
    const memory = MemoryInspector.getInstance();
    const specialist = SpecialistInspector.getInstance();
    const connector = ConnectorInspector.getInstance();
    const decision = DecisionInspector.getInstance();
    const perf = PerformanceTimeline.getInstance();
    const events = EventReplay.getInstance();

    const pipelineTl = pipeline.getTimeline(messageId);
    if (pipelineTl) {
      perf.buildFromPipeline(conversationId, messageId, pipelineTl);
    }

    const record: ObservationRecord = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId,
      messageId,
      userInput,
      capturedAt: new Date().toISOString(),
      context: ctx.getSnapshot(messageId) ?? undefined,
      prompt: prompt.getSnapshot(messageId) ?? undefined,
      pipeline: pipelineTl ?? undefined,
      streaming: streaming.getSnapshot(messageId) ?? undefined,
      memory: memory.getSnapshot(messageId) ?? undefined,
      specialists: specialist.getSnapshot(messageId) ?? undefined,
      connectors: connector.getSnapshot(messageId) ?? undefined,
      decisions: decision.getSnapshot(messageId) ?? undefined,
      performance: perf.getSnapshot(messageId) ?? undefined,
      events: events.getEventsForMessage(conversationId, messageId),
    };

    if (!this._records.has(conversationId)) {
      this._records.set(conversationId, []);
    }
    this._records.get(conversationId)!.push(record);
    return record;
  }

  // ── Replay API ──────────────────────────────────────────────────────────────

  buildReplay(
    conversationId: string,
    sessionId: string
  ): ConversationReplayT | null {
    const records = this._records.get(conversationId);
    if (!records || !records.length) return null;

    const frames: ConversationReplayFrame[] = records.map((r) => ({
      messageId: r.messageId,
      userInput: r.userInput,
      assistantResponse: r.streaming?.chunks.map((c) => c.text).join("") ?? "",
      context: r.context ?? ({} as any),
      prompt: r.prompt ?? ({} as any),
      pipeline: r.pipeline ?? ({} as any),
      specialists: r.specialists ?? ({} as any),
      connectors: r.connectors ?? ({} as any),
      streaming: r.streaming ?? ({} as any),
      memory: r.memory ?? ({} as any),
      decisions: r.decisions ?? ({} as any),
      performance: r.performance ?? ({} as any),
      events: r.events,
    }));

    return {
      conversationId,
      sessionId,
      frames,
      totalFrames: frames.length,
      capturedAt: new Date().toISOString(),
    };
  }

  getRecord(conversationId: string, messageId: string): ObservationRecord | null {
    const records = this._records.get(conversationId);
    if (!records) return null;
    return records.find((r) => r.messageId === messageId) ?? null;
  }

  getRecords(conversationId: string): ObservationRecord[] {
    return this._records.get(conversationId) ?? [];
  }

  getLatestRecord(conversationId: string): ObservationRecord | null {
    const records = this._records.get(conversationId);
    if (!records || !records.length) return null;
    return records[records.length - 1];
  }

  listConversations(): string[] {
    return Array.from(this._records.keys());
  }

  clear(): void {
    this._records.clear();
  }

  stats() {
    const convs = Array.from(this._records.values());
    return {
      totalConversations: convs.length,
      totalRecords: convs.reduce((s, r) => s + r.length, 0),
      avgRecordsPerConversation:
        convs.length > 0
          ? parseFloat((convs.reduce((s, r) => s + r.length, 0) / convs.length).toFixed(2))
          : 0,
    };
  }
}