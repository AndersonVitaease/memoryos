/**
 * NonConformityAnalyzer.ts — EF-60B.1
 *
 * Responsabilidade unica:
 * - Detectar nao-conformidades observaveis nos traces
 *
 * Nenhuma outra responsabilidade.
 * Nenhuma regra arquitetural codificada.
 * Apenas inconsistencias detectaveis nos dados observados.
 */

import type { RuntimeTrace } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";
import type { NonConformity, NC_TYPE } from "@/lib/runtime-audit/AuditTypes";

export class NonConformityAnalyzer {

  detect(traces: readonly RuntimeTrace[]): NonConformity[] {
    const ncs: NonConformity[] = [];
    let seq = 0;
    const makeId = (type: NC_TYPE) => `NC-${type}-${++seq}`;

    for (const trace of traces) {

      // NC: trace incompleto
      if (!trace.complete) {
        ncs.push({
          id:          makeId("INCOMPLETE_TRACE"),
          type:        "INCOMPLETE_TRACE",
          description: "Trace nao foi finalizado (complete=false).",
          evidence:    `traceSessionId=${trace.traceSessionId}`,
          traceId:     trace.traceSessionId,
        });
      }

      // NC: trace sem eventos
      if (trace.events.length === 0) {
        ncs.push({
          id:          makeId("ZERO_EVENTS"),
          type:        "ZERO_EVENTS",
          description: "Trace nao registrou nenhum evento.",
          evidence:    `traceSessionId=${trace.traceSessionId}`,
          traceId:     trace.traceSessionId,
        });
        continue;
      }

      const seen = new Map<string, number>();

      for (const ev of trace.events) {
        // NC: evento sem executionId
        if (!ev.executionId) {
          ncs.push({
            id:          makeId("MISSING_EXECUTION_ID"),
            type:        "MISSING_EXECUTION_ID",
            description: `Evento no stage "${ev.stage}" nao possui executionId.`,
            evidence:    `traceId=${ev.traceId} stage=${ev.stage} position=${ev.position}`,
            traceId:     ev.traceId,
            stage:       ev.stage,
            position:    ev.position,
          });
        }

        // NC: artefato sem identificacao valida
        if (!ev.artifactId || ev.artifactId === "" || ev.artifactId === "none") {
          ncs.push({
            id:          makeId("MISSING_ARTIFACT_ID"),
            type:        "MISSING_ARTIFACT_ID",
            description: `Evento no stage "${ev.stage}" nao possui artifactId valido.`,
            evidence:    `traceId=${ev.traceId} artifactId="${ev.artifactId}"`,
            traceId:     ev.traceId,
            stage:       ev.stage,
            position:    ev.position,
          });
        }

        // NC: duracao negativa ou inconsistente
        if (ev.durationMs < 0 || ev.finishedAt < ev.startedAt) {
          ncs.push({
            id:          makeId("INCONSISTENT_DURATION"),
            type:        "INCONSISTENT_DURATION",
            description: `Stage "${ev.stage}" tem durationMs=${ev.durationMs} (finishedAt < startedAt).`,
            evidence:    `startedAt=${ev.startedAt} finishedAt=${ev.finishedAt}`,
            traceId:     ev.traceId,
            stage:       ev.stage,
            position:    ev.position,
          });
        }

        // NC: stage repetido no mesmo executionId
        const key = `${ev.executionId}::${ev.stage}`;
        const prevPos = seen.get(key);
        if (prevPos !== undefined) {
          ncs.push({
            id:          makeId("STAGE_REPEATED"),
            type:        "STAGE_REPEATED",
            description: `Stage "${ev.stage}" executado mais de uma vez no mesmo executionId. Posicoes: ${prevPos} e ${ev.position}.`,
            evidence:    `executionId=${ev.executionId} stage=${ev.stage} positions=${prevPos},${ev.position}`,
            traceId:     ev.traceId,
            stage:       ev.stage,
            position:    ev.position,
          });
        }
        seen.set(key, ev.position);
      }

      // NC: violacao cronologica
      for (let i = 1; i < trace.events.length; i++) {
        const prev = trace.events[i - 1];
        const curr = trace.events[i];
        if (curr.startedAt < prev.startedAt) {
          ncs.push({
            id:          makeId("CHRONOLOGICAL_VIOLATION"),
            type:        "CHRONOLOGICAL_VIOLATION",
            description: `Evento na posicao ${curr.position} (${curr.stage}) tem startedAt anterior ao evento ${prev.position} (${prev.stage}).`,
            evidence:    `prev.startedAt=${prev.startedAt} curr.startedAt=${curr.startedAt}`,
            traceId:     curr.traceId,
            stage:       curr.stage,
            position:    curr.position,
          });
        }
      }

      // NC: quebra de continuidade do ExecutionContext
      for (const ev of trace.events) {
        if (ev.executionId && trace.executionId && ev.executionId !== trace.executionId) {
          ncs.push({
            id:          makeId("CONTEXT_BREAK"),
            type:        "CONTEXT_BREAK",
            description: `Evento no stage "${ev.stage}" possui executionId diferente do trace.`,
            evidence:    `trace.executionId=${trace.executionId} event.executionId=${ev.executionId}`,
            traceId:     ev.traceId,
            stage:       ev.stage,
            position:    ev.position,
          });
        }
      }
    }

    return ncs;
  }
}