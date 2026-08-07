/**
 * OIEOrchestrator.ts — OIE Master Orchestrator
 *
 * Responsabilidade unica: coordenar a cascata de analises (Fases 2-5)
 * apos cada execucao terminar.
 *
 * FLUXO (fire-and-forget, shadow mode):
 * 1. Dispara CoverageAnalyzer.analyzeRecent() para detectar falhas silenciosas
 * 2. Dispara DecisionAnalyzer.analyzeSession() para detectar inconsistencia de roteamento
 * 3. Dispara RegressionAnalyzer.compareSprints() para detectar regressoes
 * 4. Agrega evidencia via EvidenceEngine.fromCoverage/fromDecision/fromRegression
 * 5. Gera explicacoes via Explainer.explainAll/summarize
 *
 * PRINCIPIOS:
 *  - Fire-and-forget: nunca bloqueia o pipeline. Promise retorna imediatamente.
 *  - Shadow mode: nao toma nenhuma decisao autonoma. Resultados sao consultivos.
 *  - Read-only: nunca escreve alem de logs/observacoes.
 *  - Concorrencia: CoverageAnalyzer e DecisionAnalyzer rodam em paralelo.
 *
 * HOOK POINT: ConversationPipeline.send() — no step "Finalize" (apos resposta
 * ao usuario). Chama orchestrate(sessionId, correlationId) sem await.
 */

import { base44 } from "@/api/base44Client";
import { CoverageAnalyzer, type CoverageAnalysis } from "./CoverageAnalyzer";
import { DecisionAnalyzer, type DecisionAnalysis } from "./DecisionAnalyzer";
import { RegressionAnalyzer, type RegressionReport } from "./RegressionAnalyzer";
import { EvidenceEngine, type EvidencePacket } from "./EvidenceEngine";
import { Explainer, type Explanation, type ExplanationSummary } from "./Explainer";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface OIEAnalysisResult {
  readonly sessionId: string;
  readonly executionId?: string;
  readonly coverageAnalysis: CoverageAnalysis[] | null;
  readonly decisionAnalysis: DecisionAnalysis | null;
  readonly regressionReport: RegressionReport | null;
  readonly evidencePackets: EvidencePacket[];
  readonly explanations: Explanation[];
  readonly explanationSummary: ExplanationSummary;
  readonly completedAt: number;
  readonly errors: readonly string[];
}

export const OIEOrchestrator = {
  async orchestrate(sessionId: string, executionId?: string): Promise<OIEAnalysisResult> {
    const startedAt = Date.now();
    const errors: string[] = [];
    let coverageAnalysis: CoverageAnalysis[] | null = null;
    let decisionAnalysis: DecisionAnalysis | null = null;
    let regressionReport: RegressionReport | null = null;
    const evidencePackets: EvidencePacket[] = [];
    const explanations: Explanation[] = [];

    try {
      const coveragePromise = CoverageAnalyzer.analyzeRecent(sessionId, 20)
        .catch((err) => { errors.push(`CoverageAnalyzer failed: ${err}`); return null; });
      const decisionPromise = DecisionAnalyzer.analyzeSession(sessionId, 2, 100)
        .catch((err) => { errors.push(`DecisionAnalyzer failed: ${err}`); return null; });

      [coverageAnalysis, decisionAnalysis] = await Promise.all([coveragePromise, decisionPromise]);

      regressionReport = await RegressionAnalyzer.compareSprints("S1-OIE", "S0-baseline", 500)
        .catch((err) => { errors.push(`RegressionAnalyzer failed: ${err}`); return null; });

      if (coverageAnalysis && coverageAnalysis.length > 0) {
        for (const analysis of coverageAnalysis) {
          evidencePackets.push(...EvidenceEngine.fromCoverage(analysis));
        }
      }
      if (decisionAnalysis) {
        evidencePackets.push(...EvidenceEngine.fromDecision(decisionAnalysis));
      }
      if (regressionReport) {
        evidencePackets.push(...EvidenceEngine.fromRegression(regressionReport));
      }

      if (evidencePackets.length > 0) {
        for (const packet of evidencePackets) {
          explanations.push(...Explainer.explainAll([packet]));
        }
      }
    } catch (err) {
      errors.push(`Orchestrator top-level error: ${err}`);
    }

    const explanationSummary: ExplanationSummary = {
      total: explanations.length,
      critical: explanations.filter((e) => e.severity === "critical").length,
      warning: explanations.filter((e) => e.severity === "warning").length,
      info: explanations.filter((e) => e.severity === "info").length,
      byFindingType: {},
    };

    for (const expl of explanations) {
      explanationSummary.byFindingType[expl.findingType] =
        (explanationSummary.byFindingType[expl.findingType] ?? 0) + 1;
    }

    const result: OIEAnalysisResult = {
      sessionId,
      executionId,
      coverageAnalysis,
      decisionAnalysis,
      regressionReport,
      evidencePackets: Object.freeze(evidencePackets),
      explanations: Object.freeze(explanations),
      explanationSummary: Object.freeze(explanationSummary),
      completedAt: Date.now(),
      errors: Object.freeze(errors),
    };

    if (errors.length > 0 || explanations.length > 0) {
      const duration = result.completedAt - startedAt;
      console.log(`[OIE] orchestrate(${sessionId}) completed in ${duration}ms`, {
        explanations: explanations.length, evidence: evidencePackets.length, errors: errors.length,
      });
    }

    return Object.freeze(result);
  },
};
