/**
 * PipelineTimeline.ts — Pipeline Timeline Inspector
 * Sprint 7.1.1: Records each pipeline stage with durations.
 */

import type { PipelineStep, PipelineTimeline as PipelineTimelineT, PipelineStage } from "./COPTypes";

const STAGE_LABELS: Record<PipelineStage, string> = {
  prepare: "Prepare",
  persist: "Persist",
  build_context: "Build Context",
  recover_memory: "Recover Memory",
  route_specialists: "Route Specialists",
  execute_capabilities: "Execute Capabilities",
  synthesize: "Synthesize",
  streaming: "Streaming",
  finalize: "Finalize",
};

export class PipelineTimelineInspector {
  private static _instance: PipelineTimelineInspector | null = null;
  private _timelines: Map<string, PipelineTimelineT> = new Map();

  static getInstance(): PipelineTimelineInspector {
    if (!PipelineTimelineInspector._instance) {
      PipelineTimelineInspector._instance = new PipelineTimelineInspector();
    }
    return PipelineTimelineInspector._instance;
  }

  // ── Recording API ───────────────────────────────────────────────────────────

  startTimeline(conversationId: string, messageId: string): void {
    this._timelines.set(messageId, {
      conversationId,
      messageId,
      startedAt: Date.now(),
      steps: [],
    });
  }

  stageStart(
    messageId: string,
    stage: PipelineStage,
    metadata?: Record<string, unknown>
  ): void {
    const tl = this._timelines.get(messageId);
    if (!tl) return;
    // mark any running step as done
    tl.steps.forEach((s) => {
      if (s.status === "running" && !s.endedAt) {
        s.endedAt = Date.now();
        s.durationMs = s.endedAt - s.startedAt;
        s.status = "done";
      }
    });
    tl.steps.push({
      stage,
      label: STAGE_LABELS[stage],
      startedAt: Date.now(),
      status: "running",
      metadata,
    });
  }

  stageDone(
    messageId: string,
    stage: PipelineStage,
    metadata?: Record<string, unknown>
  ): void {
    const tl = this._timelines.get(messageId);
    if (!tl) return;
    const step = tl.steps.find((s) => s.stage === stage && s.status === "running");
    if (!step) return;
    step.endedAt = Date.now();
    step.durationMs = step.endedAt - step.startedAt;
    step.status = "done";
    if (metadata) step.metadata = { ...step.metadata, ...metadata };
  }

  stageError(
    messageId: string,
    stage: PipelineStage,
    error: string
  ): void {
    const tl = this._timelines.get(messageId);
    if (!tl) return;
    const step = tl.steps.find((s) => s.stage === stage && s.status === "running");
    if (!step) return;
    step.endedAt = Date.now();
    step.durationMs = step.endedAt - step.startedAt;
    step.status = "error";
    step.error = error;
  }

  stageSkip(messageId: string, stage: PipelineStage): void {
    const tl = this._timelines.get(messageId);
    if (!tl) return;
    tl.steps.push({
      stage,
      label: STAGE_LABELS[stage],
      startedAt: Date.now(),
      status: "skipped",
    });
  }

  finalizeTimeline(messageId: string): void {
    const tl = this._timelines.get(messageId);
    if (!tl) return;
    tl.endedAt = Date.now();
    tl.totalDurationMs = tl.endedAt - tl.startedAt;
    // close any still-running steps
    tl.steps.forEach((s) => {
      if (s.status === "running") {
        s.endedAt = tl.endedAt;
        s.durationMs = (tl.endedAt ?? Date.now()) - s.startedAt;
        s.status = "done";
      }
    });
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getTimeline(messageId: string): PipelineTimelineT | null {
    return this._timelines.get(messageId) ?? null;
  }

  getLatest(): PipelineTimelineT | null {
    const all = Array.from(this._timelines.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): PipelineTimelineT[] {
    return Array.from(this._timelines.values());
  }

  clear(): void {
    this._timelines.clear();
  }

  stats() {
    const all = this.listAll().filter((t) => t.totalDurationMs != null);
    return {
      totalTimelines: all.length,
      avgDurationMs:
        all.length > 0
          ? Math.round(all.reduce((s, t) => s + (t.totalDurationMs ?? 0), 0) / all.length)
          : 0,
      maxDurationMs: all.reduce((m, t) => Math.max(m, t.totalDurationMs ?? 0), 0),
    };
  }
}