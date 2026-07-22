/**
 * ArtifactAnalyzer.ts — EF-60B.1
 *
 * Responsabilidade unica:
 * - Listar artefatos observados na timeline
 * - Localizar o momento de criacao de cada artefato
 * - Produzir o catalogo de artefatos
 *
 * Sem ownership. Sem contratos.
 */

import type { StageTraceEvent } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";
import type { ArtifactRecord } from "@/lib/runtime-audit/AuditTypes";

export class ArtifactAnalyzer {

  /** Mapeia cada evento da timeline para um registro de artefato observado. */
  buildArtifactCatalog(timeline: StageTraceEvent[]): ArtifactRecord[] {
    return timeline.map(ev => ({
      artifactId:  ev.artifactId,
      stage:       ev.stage,
      executionId: ev.executionId,
      runIndex:    ev.runIndex,
      createdAt:   ev.startedAt,
      durationMs:  ev.durationMs,
      status:      ev.status,
    }));
  }
}