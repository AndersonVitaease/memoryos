/**
 * MetricAnalyzer.ts — EF-60B.1
 *
 * Responsabilidade unica:
 * - Calcular tempos, medias, minimos, maximos e contadores
 * - Produzir ExecutionMetrics completas
 *
 * Nenhuma NC. Nenhuma regra arquitetural.
 */

import type { RuntimeTrace, StageTraceEvent } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";
import type { ExecutionMetrics, StageMetric, ArtifactRecord, ContextFieldChange } from "@/lib/runtime-audit/AuditTypes";

export class MetricAnalyzer {

  compute(
    traces:      readonly RuntimeTrace[],
    timeline:    StageTraceEvent[],
    changelog:   ContextFieldChange[],
    artifacts:   ArtifactRecord[],
  ): ExecutionMetrics {
    const complete  = traces.filter(t => t.complete);
    const incomplete = traces.filter(t => !t.complete);
    const durations = complete.map(t => t.totalDurationMs ?? 0).filter(d => d > 0);

    const stageMap = new Map<string, {
      totalMs:  number;
      count:    number;
      min:      number;
      max:      number;
      statuses: Record<string, number>;
    }>();

    for (const ev of timeline) {
      const s = stageMap.get(ev.stage) ?? {
        totalMs: 0, count: 0, min: Infinity, max: -Infinity, statuses: {},
      };
      s.totalMs += ev.durationMs;
      s.count   += 1;
      s.min      = Math.min(s.min, ev.durationMs);
      s.max      = Math.max(s.max, ev.durationMs);
      s.statuses[ev.status] = (s.statuses[ev.status] ?? 0) + 1;
      stageMap.set(ev.stage, s);
    }

    const stageMetrics: StageMetric[] = [];
    for (const [stage, s] of stageMap) {
      stageMetrics.push({
        stage,
        count:    s.count,
        totalMs:  s.totalMs,
        avgMs:    s.count > 0 ? Math.round(s.totalMs / s.count) : 0,
        minMs:    s.min === Infinity  ? 0 : s.min,
        maxMs:    s.max === -Infinity ? 0 : s.max,
        statuses: s.statuses,
      });
    }

    return {
      totalTraces:      traces.length,
      completeTraces:   complete.length,
      incompleteTraces: incomplete.length,
      totalEvents:      timeline.length,
      totalArtifacts:   artifacts.length,
      totalCtxChanges:  changelog.length,
      avgDurationMs:    durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      minDurationMs:    durations.length > 0 ? Math.min(...durations) : 0,
      maxDurationMs:    durations.length > 0 ? Math.max(...durations) : 0,
      stageMetrics,
    };
  }
}