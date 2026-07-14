/**
 * ConfidenceEngine.ts — Sprint 6.2.1
 * Calculates implementation confidence 0–100%.
 */

import { KnowledgeGraphStore } from "../project-knowledge/KnowledgeGraphStore";
import type { ConfidenceResult, ConfidenceBreakdown, RiskReport, ReuseResult } from "./EITypes";

export class ConfidenceEngine {
  calculate(
    reuse: ReuseResult,
    risk: RiskReport,
    regressionCount: number,
    totalPreviousImplementations: number,
    successfulPreviousImplementations: number,
  ): ConfidenceResult {
    const t0 = Date.now();

    // Architecture familiarity — higher if KG is ready and populated
    const kgReady = KnowledgeGraphStore.isReady();
    const fields  = KnowledgeGraphStore.snapshotFields();
    const entityCount = (fields as any).kgEntityCount ?? 0;
    const architectureFamiliarity = kgReady && entityCount > 20 ? 0.9 : kgReady ? 0.6 : 0.3;

    // Reuse percentage — found components reduce uncertainty
    const reusePercentage = reuse.decision === "REUSE" ? 0.9
      : reuse.decision === "EXTEND" ? 0.65 : 0.4;

    // Regression history — more regressions → lower confidence
    const regressionHistory = regressionCount === 0 ? 1.0
      : regressionCount <= 2 ? 0.75 : 0.5;

    // Dependency complexity — more direct nodes → lower confidence
    const singletons = risk.factors.filter(f => f.description.includes("singleton")).length;
    const dependencyComplexity = singletons > 0 ? 0.5 : risk.overallRisk === "CRITICAL" ? 0.4
      : risk.overallRisk === "HIGH" ? 0.6 : risk.overallRisk === "MEDIUM" ? 0.75 : 0.9;

    // Component stability — based on risk factors
    const componentStability = risk.factors.length === 0 ? 0.95
      : risk.overallRisk === "LOW" ? 0.85 : risk.overallRisk === "MEDIUM" ? 0.7 : 0.5;

    // Previous success rate
    const previousSuccessRate = totalPreviousImplementations === 0 ? 0.8
      : successfulPreviousImplementations / totalPreviousImplementations;

    const breakdown: ConfidenceBreakdown = {
      architectureFamiliarity,
      reusePercentage,
      regressionHistory,
      dependencyComplexity,
      componentStability,
      previousSuccessRate,
    };

    // Weighted average
    const weights = [0.2, 0.2, 0.15, 0.2, 0.15, 0.1];
    const values  = [
      architectureFamiliarity, reusePercentage, regressionHistory,
      dependencyComplexity, componentStability, previousSuccessRate,
    ];
    const raw = values.reduce((sum, v, i) => sum + v * weights[i], 0);
    const score = Math.round(Math.min(100, Math.max(0, raw * 100)));

    const label =
      score >= 85 ? "VERY_HIGH" :
      score >= 70 ? "HIGH" :
      score >= 50 ? "MEDIUM" :
      score >= 30 ? "LOW" : "UNCERTAIN";

    return { score, breakdown, label, durationMs: Date.now() - t0 };
  }
}