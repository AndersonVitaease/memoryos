/**
 * RuntimeArchitectureAuditor.ts — EF-60B.1
 *
 * Orquestrador da auditoria arquitetural.
 * Nenhuma logica analitica reside aqui.
 * Apenas invoca os Analyzers e agrega os resultados.
 *
 * API publica identica a EF-60B:
 *   audit(traces: readonly RuntimeTrace[]): AuditReport
 */

import type { RuntimeTrace } from "@/lib/runtime-trace/OfficialRuntimeTraceStore";
import type { AuditReport }  from "@/lib/runtime-audit/AuditTypes";

import { TimelineAnalyzer }         from "@/lib/runtime-audit/analyzers/TimelineAnalyzer";
import { ExecutionContextAnalyzer } from "@/lib/runtime-audit/analyzers/ExecutionContextAnalyzer";
import { ArtifactAnalyzer }         from "@/lib/runtime-audit/analyzers/ArtifactAnalyzer";
import { MetricAnalyzer }           from "@/lib/runtime-audit/analyzers/MetricAnalyzer";
import { IntegrityAnalyzer }        from "@/lib/runtime-audit/analyzers/IntegrityAnalyzer";
import { NonConformityAnalyzer }    from "@/lib/runtime-audit/analyzers/NonConformityAnalyzer";

// Re-exportar todos os tipos publicos para compatibilidade com consumidores da EF-60B
export type {
  AuditReport,
  StageMetric,
  ArtifactRecord,
  ContextFieldChange,
  NonConformity,
  NC_TYPE,
  TraceIntegrityScore,
  ExecutionMetrics,
} from "@/lib/runtime-audit/AuditTypes";

// ─── Orquestrador ────────────────────────────────────────────────────────────

export class RuntimeArchitectureAuditor {

  private readonly timeline    = new TimelineAnalyzer();
  private readonly ctx         = new ExecutionContextAnalyzer();
  private readonly artifacts   = new ArtifactAnalyzer();
  private readonly metrics     = new MetricAnalyzer();
  private readonly integrity   = new IntegrityAnalyzer();
  private readonly nca         = new NonConformityAnalyzer();

  /** Ponto de entrada — aceita os traces da EF-60A, delega aos Analyzers, agrega. */
  audit(traces: readonly RuntimeTrace[]): AuditReport {
    if (traces.length === 0) {
      return this._emptyReport();
    }

    // 1. Timeline e sequencias
    const timeline       = this.timeline.buildTimeline(traces);
    const stageSequences = this.timeline.buildStageSequences(traces);

    // 2. ExecutionContext changelog
    const ctxChangelog = this.ctx.buildChangelog(timeline);

    // 3. Catalogo de artefatos
    const artifactList = this.artifacts.buildArtifactCatalog(timeline);

    // 4. Nao-conformidades
    const nonConformities = this.nca.detect(traces);

    // 5. Metricas
    const executionMetrics = this.metrics.compute(traces, timeline, ctxChangelog, artifactList);

    // 6. Score de integridade (consome metricas + NCs, nao produz novas)
    const integrityScore = this.integrity.compute(executionMetrics, nonConformities);

    return {
      generatedAt:    Date.now(),
      tracesAnalyzed: traces.length,
      metrics:        executionMetrics,
      timeline,
      ctxChangelog,
      artifacts:      artifactList,
      nonConformities,
      integrity:      integrityScore,
      stageSequences,
    };
  }

  // ─── Relatorio vazio (sem traces) ────────────────────────────────────────────

  private _emptyReport(): AuditReport {
    return {
      generatedAt:    Date.now(),
      tracesAnalyzed: 0,
      metrics: {
        totalTraces: 0, completeTraces: 0, incompleteTraces: 0,
        totalEvents: 0, totalArtifacts: 0, totalCtxChanges: 0,
        avgDurationMs: 0, minDurationMs: 0, maxDurationMs: 0,
        stageMetrics: [],
      },
      timeline:        [],
      ctxChangelog:    [],
      artifacts:       [],
      nonConformities: [],
      integrity:       { score: 0, label: "UNKNOWN", details: ["Nenhum trace disponivel."] },
      stageSequences:  [],
    };
  }
}