/**
 * PerformanceTimeline.ts — Performance Timeline Inspector
 * Sprint 7.1.1: Records latency, memory, and per-stage performance.
 */

import type { PerformanceSnapshot, PipelineStage, PipelineTimeline } from "./COPTypes";

export class PerformanceTimeline {
  private static _instance: PerformanceTimeline | null = null;
  private _snapshots: Map<string, PerformanceSnapshot> = new Map();

  static getInstance(): PerformanceTimeline {
    if (!PerformanceTimeline._instance) {
      PerformanceTimeline._instance = new PerformanceTimeline();
    }
    return PerformanceTimeline._instance;
  }

  // ── Build from pipeline ─────────────────────────────────────────────────────

  buildFromPipeline(
    conversationId: string,
    messageId: string,
    timeline: PipelineTimeline
  ): void {
    const total = timeline.totalDurationMs ?? 0;
    const stageBreakdown = timeline.steps
      .filter((s) => s.durationMs != null)
      .map((s) => ({
        stage: s.stage as PipelineStage,
        durationMs: s.durationMs ?? 0,
        pct: total > 0 ? parseFloat(((( s.durationMs ?? 0) / total) * 100).toFixed(1)) : 0,
      }));

    let memUsage: number | undefined;
    try {
      // @ts-ignore
      const mem = (performance as any).memory;
      if (mem) {
        memUsage = parseFloat((mem.usedJSHeapSize / 1048576).toFixed(2));
      }
    } catch {
      // not supported
    }

    this._snapshots.set(messageId, {
      conversationId,
      messageId,
      capturedAt: new Date().toISOString(),
      totalLatencyMs: total,
      stageBreakdown,
      memoryUsageMB: memUsage,
      estimatedCpuPct: undefined, // browser doesn't expose CPU
    });
  }

  // ── Query API ───────────────────────────────────────────────────────────────

  getSnapshot(messageId: string): PerformanceSnapshot | null {
    return this._snapshots.get(messageId) ?? null;
  }

  getLatest(): PerformanceSnapshot | null {
    const all = Array.from(this._snapshots.values());
    return all.length ? all[all.length - 1] : null;
  }

  listAll(): PerformanceSnapshot[] {
    return Array.from(this._snapshots.values());
  }

  clear(): void {
    this._snapshots.clear();
  }

  stats() {
    const all = this.listAll();
    return {
      totalSnapshots: all.length,
      avgLatencyMs:
        all.length > 0
          ? Math.round(all.reduce((s, x) => s + x.totalLatencyMs, 0) / all.length)
          : 0,
      maxLatencyMs: all.reduce((m, x) => Math.max(m, x.totalLatencyMs), 0),
      minLatencyMs:
        all.length > 0
          ? all.reduce((m, x) => Math.min(m, x.totalLatencyMs), Infinity)
          : 0,
    };
  }
}