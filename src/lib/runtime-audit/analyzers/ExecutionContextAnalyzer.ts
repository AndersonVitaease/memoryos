/**
 * ExecutionContextAnalyzer.ts — EF-60B.1
 *
 * Responsabilidade unica:
 * - Analisar ctxBefore, ctxAfter e ctxDelta de cada evento
 * - Gerar changelog de alteracoes observadas no ExecutionContext
 */

import type { StageTraceEvent } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";
import type { ContextFieldChange } from "@/lib/runtime-audit/AuditTypes";

export class ExecutionContextAnalyzer {

  /** Percorre a timeline e produz o changelog de campos adicionados ao ctx. */
  buildChangelog(timeline: StageTraceEvent[]): ContextFieldChange[] {
    const changes: ContextFieldChange[] = [];
    for (const ev of timeline) {
      for (const field of Object.keys(ev.ctxDelta)) {
        changes.push({
          field,
          stage:    ev.stage,
          position: ev.position,
          type:     "added",
        });
      }
    }
    return changes;
  }
}