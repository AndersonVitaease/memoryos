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
import { AnomalyPredictor, type PredictionReport } from "./AnomalyPredictor";
import { EvidenceEngine, type EvidencePacket } from "./EvidenceEngine";
import { Explainer, type Explanation, type ExplanationSummary } from "./Explainer";
// Track 1 (promover a ativo, consultivo): publica findings critical/warning
// no OIEAlertBus para o listener de UI mostrar toasts + popular o painel /oie.
import { OIEAlertBus, extractAlerts } from "./OIEAlertBus";
import { OIEConfig } from "./OIEConfig";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface OIEAnalysisResult {
  readonly sessionId: string;
  readonly executionId?: string;
  readonly coverageAnalysis: CoverageAnalysis[] | null;
  readonly decisionAnalysis: DecisionAnalysis | null;
  readonly regressionReport: RegressionReport | null;
  readonly predictionReport: PredictionReport | null;
  readonly evidencePackets: EvidencePacket[];
  readonly explanations: Explanation[];
  readonly explanationSummary: ExplanationSummary;
  readonly completedAt: number;
  readonly errors: readonly string[];
}

function _emptyResult(sessionId: string, executionId: string | undefined, errors: string[]): OIEAnalysisResult {
  const emptySummary = Object.freeze({ total: 0, critical: 0, warning: 0, info: 0, byFindingType: Object.freeze({}) });
  return Object.freeze({
    sessionId,
    executionId,
    coverageAnalysis: null,
    decisionAnalysis: null,
    regressionReport: null,
    predictionReport: null,
    evidencePackets: Object.freeze([]),
    explanations: Object.freeze([]),
    explanationSummary: emptySummary,
    completedAt: Date.now(),
    errors: Object.freeze(errors),
  });
}

export const OIEOrchestrator = {
  async orchestrate(sessionId: string, executionId?: string): Promise<OIEAnalysisResult> {
    const startedAt = Date.now();
    const cfg = OIEConfig.get();

    // Master switch: OIE inteiro desligado -> retorna vazio, nada analisa.
    if (!cfg.enabled) {
      return _emptyResult(sessionId, executionId, ["OIE disabled by config"]);
    }

    const errors: string[] = [];
    let coverageAnalysis: CoverageAnalysis[] | null = null;
    let decisionAnalysis: DecisionAnalysis | null = null;
    let regressionReport: RegressionReport | null = null;
    let predictionReport: PredictionReport | null = null;
    const evidencePackets: EvidencePacket[] = [];
    const explanations: Explanation[] = [];

    try {
      // Cada analise roda só se o modulo correspondente esta ligado.
      const tasks: Promise<unknown>[] = [];
      if (cfg.modules.coverage) {
        tasks.push(CoverageAnalyzer.analyzeRecent(sessionId, 20)
          .then((r) => { coverageAnalysis = r; })
          .catch((err) => { errors.push(`CoverageAnalyzer failed: ${err}`); }));
      }
      if (cfg.modules.decision) {
        tasks.push(DecisionAnalyzer.analyzeSession(sessionId, 2, 100)
          .then((r) => { decisionAnalysis = r; })
          .catch((err) => { errors.push(`DecisionAnalyzer failed: ${err}`); }));
      }
      if (cfg.modules.regression) {
        tasks.push(RegressionAnalyzer.compareSprints("S1-OIE", "S0-baseline", 500, cfg.thresholds.failureRateWarning)
          .then((r) => { regressionReport = r; })
          .catch((err) => { errors.push(`RegressionAnalyzer failed: ${err}`); }));
      }
      if (cfg.modules.prediction) {
        tasks.push(AnomalyPredictor.predict("day", cfg)
          .then((r) => { predictionReport = r; })
          .catch((err) => { errors.push(`AnomalyPredictor failed: ${err}`); }));
      }
      await Promise.all(tasks);

      // Evidence Engine costura as analises em packets. Se desligado, nao
      // ha packets — o Explainer nao tem o que explicar.
      if (cfg.modules.evidence) {
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
        if (predictionReport) {
          evidencePackets.push(...EvidenceEngine.fromPrediction(predictionReport));
        }
      }

      if (cfg.modules.explainer && evidencePackets.length > 0) {
        for (const packet of evidencePackets) {
          explanations.push(...Explainer.explainAll([packet]));
        }
        // Limiar critical: se a sprint atual nao chegou no failureRateCritical,
        // um finding de failure_rate_increase nao merece critical — desce pra warning.
        if (regressionReport && regressionReport.current.failureRate < cfg.thresholds.failureRateCritical) {
          for (let i = 0; i < explanations.length; i++) {
            if (explanations[i].findingType === "failure_rate_increase" && explanations[i].severity === "critical") {
              explanations[i] = { ...explanations[i], severity: "warning" };
            }
          }
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
      predictionReport,
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

    // Track 1: publica alertas acionaveis (critical/warning) no bus. Consultivo
    // — so informa, nunca age. Fire-and-forget; falha aqui e silenciosa por
    // design (o bus tem catch interno no publisher e no listener).
    try {
      const alerts = extractAlerts({
        explanations: result.explanations,
        executionId: result.executionId,
        sessionId: result.sessionId,
        completedAt: result.completedAt,
      });
      if (alerts.length > 0) OIEAlertBus.publish(alerts);
    } catch { /* nunca quebra o orchestrator */ }

    return Object.freeze(result);
  },
};