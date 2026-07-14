/**
 * CognitiveObservabilityManager.ts — Master COP Orchestrator
 * Sprint 7.1.1: Single public API for all observability operations.
 */

import type { COPConfig, ObservationRecord } from "./COPTypes";
import { DEFAULT_COP_CONFIG } from "./COPTypes";
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
import { ConversationReplayEngine } from "./ConversationReplay";

const GLOBAL_KEY = "__COP_MANAGER__";

export class CognitiveObservabilityManager {
  private _config: COPConfig;
  private _health = { status: "healthy", errors: [] as string[] };

  private constructor(config: COPConfig) {
    this._config = config;
  }

  static getInstance(config?: Partial<COPConfig>): CognitiveObservabilityManager {
    const g = globalThis as any;
    if (!g[GLOBAL_KEY]) {
      g[GLOBAL_KEY] = new CognitiveObservabilityManager({
        ...DEFAULT_COP_CONFIG,
        ...config,
      });
    }
    return g[GLOBAL_KEY];
  }

  // ── Sub-inspector accessors ─────────────────────────────────────────────────

  get context(): ContextInspector { return ContextInspector.getInstance(); }
  get prompt(): PromptInspector { return PromptInspector.getInstance(); }
  get pipeline(): PipelineTimelineInspector { return PipelineTimelineInspector.getInstance(); }
  get streaming(): StreamingInspector { return StreamingInspector.getInstance(); }
  get memory(): MemoryInspector { return MemoryInspector.getInstance(); }
  get specialist(): SpecialistInspector { return SpecialistInspector.getInstance(); }
  get connector(): ConnectorInspector { return ConnectorInspector.getInstance(); }
  get decision(): DecisionInspector { return DecisionInspector.getInstance(); }
  get performance(): PerformanceTimeline { return PerformanceTimeline.getInstance(); }
  get events(): EventReplay { return EventReplay.getInstance(); }
  get replay(): ConversationReplayEngine { return ConversationReplayEngine.getInstance(); }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Begin observing a new message exchange.
   * Call this before the pipeline starts for any given user message.
   */
  beginObservation(
    conversationId: string,
    messageId: string,
    userInput: string,
    model = "automatic"
  ): void {
    if (!this._config.enabled) return;
    this.events.initLog(conversationId);
    this.events.emitSystem(conversationId, "observation.start", { conversationId, messageId, userInput });

    if (this._config.captureContext) this.context.startCapture(conversationId, messageId);
    if (this._config.capturePrompt) this.prompt.startCapture(conversationId, messageId, model);
    this.pipeline.startTimeline(conversationId, messageId);
    if (this._config.captureStreaming) this.streaming.startStreaming(conversationId, messageId);
    if (this._config.captureMemory) this.memory.startCapture(conversationId, messageId);
    if (this._config.captureSpecialists) this.specialist.startCapture(conversationId, messageId);
    if (this._config.captureConnectors) this.connector.startCapture(conversationId, messageId);
    if (this._config.captureDecisions) this.decision.startCapture(conversationId, messageId);
  }

  /**
   * Finalize the observation and assemble the record.
   */
  finalizeObservation(
    conversationId: string,
    messageId: string,
    userInput: string
  ): ObservationRecord {
    this.pipeline.finalizeTimeline(messageId);
    this.streaming.finalizeStreaming(messageId);
    this.events.emitSystem(conversationId, "observation.end", { conversationId, messageId });
    return this.replay.assembleRecord(conversationId, messageId, userInput);
  }

  // ── Pipeline stage helpers ──────────────────────────────────────────────────

  pipelineStart(messageId: string, conversationId: string, stage: Parameters<PipelineTimelineInspector["stageStart"]>[1]): void {
    this.pipeline.stageStart(messageId, stage);
    this.events.emitPipeline(conversationId, messageId, stage, "start");
  }

  pipelineDone(messageId: string, conversationId: string, stage: Parameters<PipelineTimelineInspector["stageDone"]>[1], durationMs?: number): void {
    this.pipeline.stageDone(messageId, stage);
    this.events.emitPipeline(conversationId, messageId, stage, "done", durationMs);
  }

  pipelineError(messageId: string, conversationId: string, stage: Parameters<PipelineTimelineInspector["stageError"]>[1], error: string): void {
    this.pipeline.stageError(messageId, stage, error);
    this.events.emitPipeline(conversationId, messageId, stage, "error");
  }

  // ── Streaming helpers ───────────────────────────────────────────────────────

  onStreamChunk(messageId: string, conversationId: string, text: string): void {
    this.streaming.onChunk(messageId, text);
    this.events.emitStreaming(conversationId, messageId, "chunk", { charCount: text.length });
  }

  onStreamDone(messageId: string, conversationId: string): void {
    this.streaming.finalizeStreaming(messageId);
    const snap = this.streaming.getSnapshot(messageId);
    this.events.emitStreaming(conversationId, messageId, "done", {
      totalChars: snap?.totalChars,
      tokensPerSecond: snap?.tokensPerSecond,
      timeToFirstTokenMs: snap?.timeToFirstTokenMs,
    });
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  configure(config: Partial<COPConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): COPConfig { return { ...this._config }; }

  // ── Health ──────────────────────────────────────────────────────────────────

  health() {
    return {
      ...this._health,
      enabled: this._config.enabled,
      inspectors: {
        context: "ok",
        prompt: "ok",
        pipeline: "ok",
        streaming: "ok",
        memory: "ok",
        specialist: "ok",
        connector: "ok",
        decision: "ok",
        performance: "ok",
        events: "ok",
        replay: "ok",
      },
    };
  }

  metrics() {
    return {
      context: this.context.stats(),
      prompt: this.prompt.stats(),
      pipeline: this.pipeline.stats(),
      streaming: this.streaming.stats(),
      memory: this.memory.stats(),
      specialist: this.specialist.stats(),
      connector: this.connector.stats(),
      decision: this.decision.stats(),
      performance: this.performance.stats(),
      events: this.events.stats(),
      replay: this.replay.stats(),
    };
  }

  // ── Clear ───────────────────────────────────────────────────────────────────

  clearAll(): void {
    this.context.clear();
    this.prompt.clear();
    this.pipeline.clear();
    this.streaming.clear();
    this.memory.clear();
    this.specialist.clear();
    this.connector.clear();
    this.decision.clear();
    this.performance.clear();
    this.events.clear();
    this.replay.clear();
  }

  // ── Audit ───────────────────────────────────────────────────────────────────

  auditReadiness(): { status: string; passed: string[]; failed: string[] } {
    const passed: string[] = [];
    const failed: string[] = [];

    const checks = [
      ["ContextInspector", () => !!ContextInspector.getInstance()],
      ["PromptInspector", () => !!PromptInspector.getInstance()],
      ["PipelineTimeline", () => !!PipelineTimelineInspector.getInstance()],
      ["StreamingInspector", () => !!StreamingInspector.getInstance()],
      ["MemoryInspector", () => !!MemoryInspector.getInstance()],
      ["SpecialistInspector", () => !!SpecialistInspector.getInstance()],
      ["ConnectorInspector", () => !!ConnectorInspector.getInstance()],
      ["DecisionInspector", () => !!DecisionInspector.getInstance()],
      ["PerformanceTimeline", () => !!PerformanceTimeline.getInstance()],
      ["EventReplay", () => !!EventReplay.getInstance()],
      ["ConversationReplay", () => !!ConversationReplayEngine.getInstance()],
      ["COPEnabled", () => this._config.enabled],
    ] as Array<[string, () => boolean]>;

    checks.forEach(([name, fn]) => {
      try {
        if (fn()) passed.push(name);
        else failed.push(name);
      } catch {
        failed.push(name);
      }
    });

    return {
      status: failed.length === 0 ? "COGNITIVE OBSERVABILITY PLATFORM READY" : "DEGRADED",
      passed,
      failed,
    };
  }
}