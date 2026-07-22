/**
 * TimelineAnalyzer.ts — EF-60B.1
 *
 * Responsabilidade unica:
 * - Reconstruir a timeline a partir dos traces
 * - Ordenar eventos cronologicamente (por startedAt observado)
 * - Identificar a sequencia de stages por trace
 */

import type { RuntimeTrace, StageTraceEvent } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";
import type { AuditReport } from "@/lib/runtime-audit/AuditTypes";

export class TimelineAnalyzer {

  /** Coleta todos os eventos de todos os traces e ordena por startedAt. */
  buildTimeline(traces: readonly RuntimeTrace[]): StageTraceEvent[] {
    const all: StageTraceEvent[] = [];
    for (const t of traces) {
      for (const ev of t.events) {
        all.push(ev);
      }
    }
    return all.slice().sort((a, b) => a.startedAt - b.startedAt);
  }

  /** Produz a sequencia de stages observada para cada trace. */
  buildStageSequences(traces: readonly RuntimeTrace[]): AuditReport["stageSequences"] {
    return traces.map(t => ({
      runIndex:    t.runIndex,
      executionId: t.executionId,
      sequence:    t.events.map(ev => ev.stage),
    }));
  }
}