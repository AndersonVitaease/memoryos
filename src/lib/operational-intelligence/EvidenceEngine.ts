/**
 * EvidenceEngine.ts — OIE Fase 4.5 (Sprint 7)
 *
 * Responsabilidade unica: transformar as descobertas das Fases 1-4 (Coverage,
 * Decision, Regression) em EVIDENCE PACKETS — estruturas que apontam para os
 * registros concretos (InteractionEvent / ExecutionObservation) que sustentam
 * cada finding, com locator + valor + timestamp. Nada e inventado aqui:
 * cada claim referencia dados que ja existem nas entidades.
 *
 * POR QUE EXISTE:
 *   O Explainer (Fase 5) precisa de aterramento. Em vez de ele re-derivar
 *   as descobertas, recebe EvidencePackets prontos com claims apontadas.
 *   Sem evidence, o Explainer alucina; com evidence, ele CITA.
 *
 * FONTE DE DADOS:
 *   Nao re-query. Consome os objetos de analise JA PRODUZIDOS:
 *     - CoverageAnalysis (Fase 3)
 *     - DecisionAnalysis (Fase 2.5)
 *     - RegressionReport (Fase 4)
 *   Cada finding vira um EvidencePacket com claims derivadas dos campos
 *   desses objetos.
 *
 * PRINCIPIOS: read-only, deterministico, sem LLM, sem nova entidade.
 */

import type { CoverageAnalysis } from "./CoverageAnalyzer";
import type { DecisionAnalysis, IntentGroup } from "./DecisionAnalyzer";
import type { RegressionReport } from "./RegressionAnalyzer";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface EvidenceClaim {
  readonly source: "InteractionEvent" | "ExecutionObservation";
  readonly executionId: string;
  readonly locator: string;
  readonly value: string;
  readonly timestamp: string | null;
}

export interface EvidencePacket {
  readonly findingType: string;
  readonly executionId: string | null;
  readonly summary: string;
  readonly claims: readonly EvidenceClaim[];
}

// ── EvidenceEngine ──────────────────────────────────────────────────────────

export const EvidenceEngine = {
  /**
   * Transforma um CoverageAnalysis (Fase 3) em EvidencePackets — um por
   * behavior_signature detectada. Cada packet aponta para a intent (se houver)
   * e para as observacoes que sustentam a assinatura.
   */
  fromCoverage(analysis: CoverageAnalysis): EvidencePacket[] {
    return analysis.behaviorSignatures.map((sig) => {
      const claims: EvidenceClaim[] = [];
      if (analysis.intent) {
        claims.push({
          source: "InteractionEvent",
          executionId: analysis.executionId,
          locator: `intent_hash=${analysis.intent.intent_hash ?? "null"}`,
          value: `quantifiers=[${analysis.intent.quantifiers.join(",")}] raw_text="${(analysis.intent.raw_text ?? "").slice(0, 120)}"`,
          timestamp: null,
        });
      }
      for (const a of analysis.actual) {
        claims.push({
          source: "ExecutionObservation",
          executionId: analysis.executionId,
          locator: `${a.connector}.${a.capability}`,
          value: `status=${a.status}`,
          timestamp: null,
        });
      }
      if (sig === "CoverageGap" && analysis.coverageGap) {
        claims.push({
          source: "ExecutionObservation",
          executionId: analysis.executionId,
          locator: "ArchitectureMap.expectedCapabilities",
          value: `missing=${analysis.coverageGap.map((c) => `${c.connector}.${c.capability}`).join(",")}`,
          timestamp: null,
        });
      }
      return Object.freeze({
        findingType: sig,
        executionId: analysis.executionId,
        summary: this._summaryForCoverage(sig, analysis),
        claims: Object.freeze(claims),
      });
    });
  },

  /**
   * Transforma um DecisionAnalysis (Fase 2.5) em EvidencePackets — um por
   * grupo flagado. Cada packet cita os executionIds e os goalTypes distintos.
   */
  fromDecision(analysis: DecisionAnalysis): EvidencePacket[] {
    return analysis.flaggedGroups.map((g) => this._packetForGroup(g));
  },

  /**
   * Transforma um RegressionReport (Fase 4) em EvidencePackets — um por
   * finding. Cada packet cita as contagens das duas sprints.
   */
  fromRegression(report: RegressionReport): EvidencePacket[] {
    return report.findings.map((f) => {
      const claims: EvidenceClaim[] = [];
      if (f.type === "new_error_signature" || f.type === "new_behavior_signature" || f.type === "failure_rate_increase") {
        const sigKey = f.type === "failure_rate_increase" ? null : f.detail.match(/"([^"]+)"/)?.[1];
        if (f.type === "new_error_signature" && sigKey) {
          const cur = report.current.errorSignatures[sigKey] ?? 0;
          const base = report.baseline.errorSignatures[sigKey] ?? 0;
          claims.push({
            source: "ExecutionObservation",
            executionId: null,
            locator: `sprint=${report.current.sprintTag} error_signature="${sigKey}"`,
            value: `count=${cur} (baseline ${report.baseline.sprintTag}=${base})`,
            timestamp: null,
          });
        }
        if (f.type === "new_behavior_signature" && sigKey) {
          const cur = report.current.behaviorSignatures[sigKey] ?? 0;
          const base = report.baseline.behaviorSignatures[sigKey] ?? 0;
          claims.push({
            source: "ExecutionObservation",
            executionId: null,
            locator: `sprint=${report.current.sprintTag} behavior_signature="${sigKey}"`,
            value: `count=${cur} (baseline ${report.baseline.sprintTag}=${base})`,
            timestamp: null,
          });
        }
        if (f.type === "failure_rate_increase") {
          claims.push({
            source: "ExecutionObservation",
            executionId: null,
            locator: `failure_rate`,
            value: `${report.baseline.sprintTag}=${(report.baseline.failureRate * 100).toFixed(1)}% → ${report.current.sprintTag}=${(report.current.failureRate * 100).toFixed(1)}%`,
            timestamp: null,
          });
        }
      }
      return Object.freeze({
        findingType: f.type,
        executionId: null,
        summary: f.detail,
        claims: Object.freeze(claims),
      });
    });
  },

  // ── Internos ─────────────────────────────────────────────────────────────

  _packetForGroup(g: IntentGroup): EvidencePacket {
    const claims: EvidenceClaim[] = g.executionIds.map((execId) => ({
      source: "InteractionEvent" as const,
      executionId: execId,
      locator: `intent_hash=${g.intent_hash}`,
      value: `goal_type=${g.goalTypes.join("|") || "none"}`,
      timestamp: null,
    }));
    return Object.freeze({
      findingType: g.signatures.join("+") || "Ok",
      executionId: g.executionIds[0] ?? null,
      summary: `intent_hash=${g.intent_hash} occurrences=${g.occurrences} goalTypes=[${g.goalTypes.join(",")}]`,
      claims: Object.freeze(claims),
    });
  },

  _summaryForCoverage(sig: string, a: CoverageAnalysis): string {
    switch (sig) {
      case "NoConnectorExecution":
        return `Intent registrada para ${a.executionId} mas 0 ExecutionObservation — fallback sem connector.`;
      case "PartialRepositoryTraversal":
        return `Intent pediu "todo/all" mas so capabilities singulares rodaram (sem list/search) em ${a.executionId}.`;
      case "AllExecutionsFailed":
        return `Todas as ${a.actual.length} observacoes de ${a.executionId} terminaram failed/timeout/blocked.`;
      case "PartialSuccess":
        return `Execucao ${a.executionId} mistura success + failure — possivel terminacao parcial.`;
      case "CoverageGap":
        return `ArchitectureMap esperava capabilities que nao rodaram em ${a.executionId}.`;
      default:
        return `${sig} em ${a.executionId}.`;
    }
  },
};