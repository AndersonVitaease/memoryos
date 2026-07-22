/**
 * MetaCognitiveEngine.ts — Sprint EF-54 · Meta-Cognitive Engine
 *
 * Coordena o pipeline meta-cognitivo completo:
 *   Execution → ReasoningReport → OptimizationReport
 *   → Meta Analysis → Reflection → MetaReport
 *
 * NÃO modifica nenhuma sprint anterior (EF-43 a EF-53).
 * NÃO aprende, NÃO otimiza, NÃO cria conhecimento.
 * Apenas analisa COMO o sistema pensou.
 * Toda análise é reproduzível. Toda reflexão possui evidências.
 *
 * HMR-safe singleton via globalThis.
 */

import type { MetaReport } from "./MCTypes";
import { ThoughtAnalyzer, type ThoughtSnapshot } from "./ThoughtAnalyzer";
import { BiasDetector }          from "./BiasDetector";
import { AlternativeGenerator }  from "./AlternativeGenerator";
import { EvidenceEvaluator }     from "./EvidenceEvaluator";
import { ConfidenceReviewer }    from "./ConfidenceReviewer";
import { ConsistencyChecker }    from "./ConsistencyChecker";
import { ReasoningReviewer }     from "./ReasoningReviewer";
import { ReflectionEngine }      from "./ReflectionEngine";
import { MetaMetricsEngine }     from "./MetaMetrics";
import { MetaReportBuilder }     from "./MetaReport";
import { MetaHistory }           from "./MetaHistory";

class MetaCognitiveEngineImpl {
  private readonly _thoughtAnalyzer  = new ThoughtAnalyzer();
  private readonly _biasDetector     = new BiasDetector();
  private readonly _altGenerator     = new AlternativeGenerator();
  private readonly _evidenceEval     = new EvidenceEvaluator();
  private readonly _confReviewer     = new ConfidenceReviewer();
  private readonly _consistChecker   = new ConsistencyChecker();
  private readonly _reasoningReviewer= new ReasoningReviewer();
  private readonly _reflectionEngine = new ReflectionEngine();
  private readonly _metricsEngine    = new MetaMetricsEngine();
  private readonly _reportBuilder    = new MetaReportBuilder();

  private _reports: MetaReport[] = [];

  /**
   * Run the full meta-cognitive pipeline on a thought snapshot.
   * Returns a fully auditable MetaReport.
   * Never modifies any external module.
   */
  analyze(snap: ThoughtSnapshot): MetaReport {
    const startedAt = Date.now();

    // 1. Reconstruct cognitive flow
    const cognitiveFlow = this._thoughtAnalyzer.analyze(snap);

    // 2. Detect biases
    const biases = this._biasDetector.detect(snap);

    // 3. Generate alternatives
    const alternatives = this._altGenerator.generate(snap);

    // 4. Evaluate evidence
    const evidenceEval = this._evidenceEval.evaluate(snap);

    // 5. Review confidence
    const confidenceReview = this._confReviewer.review(snap);

    // 6. Check consistency
    const consistencyIssues = this._consistChecker.check(snap);

    // 7. Review reasoning
    const reasoningReview = this._reasoningReviewer.review(snap);

    // 8. Generate reflection
    const reflection = this._reflectionEngine.reflect(snap, biases, consistencyIssues, evidenceEval);

    // 9. Compute meta metrics
    const metrics = this._metricsEngine.compute({
      biases, alternatives, consistencyIssues,
      evidence:             evidenceEval,
      reasoningReview,
      confidenceReview,
      cognitiveFlowQuality: cognitiveFlow.overallQuality,
    });

    // 10. Build report
    const report = this._reportBuilder.build({
      startedAt, goal: snap.goal, cognitiveFlow, biases, alternatives,
      evidenceEval, consistencyIssues, confidenceReview, reasoningReview,
      reflection, metrics,
    });

    // 11. Record in history
    MetaHistory.record(report);

    this._reports.push(report);
    return report;
  }

  getReports(): readonly MetaReport[] { return this._reports; }
  getLastReport(): MetaReport | null  { return this._reports[this._reports.length - 1] ?? null; }
  clearReports(): void { this._reports = []; }
}

const G = globalThis as typeof globalThis & { __EF54_MCE__?: MetaCognitiveEngineImpl };
if (!G.__EF54_MCE__) G.__EF54_MCE__ = new MetaCognitiveEngineImpl();
export const MetaCognitiveEngine: MetaCognitiveEngineImpl = G.__EF54_MCE__;