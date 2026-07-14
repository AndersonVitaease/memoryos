/**
 * LearningEngine.ts — Sprint 6.2.1
 * Generates structured lessons after every implementation.
 * Stores everything into EngineeringMemory.
 */

import type { LessonLearned, RepairStatus, StrategyDecision, RiskReport, ConfidenceResult } from "./EITypes";

let _seq = 0;
function makeLessonId(): string { return `lesson_${Date.now()}_${++_seq}`; }

export class LearningEngine {
  generateLesson(
    objective: string,
    decision: StrategyDecision,
    risk: RiskReport,
    confidence: ConfidenceResult,
    regressionStatus: RepairStatus,
    repairCount: number,
    estimatedDurationMs: number,
    actualDurationMs: number,
  ): LessonLearned {
    const problem   = this._inferProblem(objective, risk);
    const solution  = this._inferSolution(decision, repairCount);
    const lessons   = this._deriveLessons(decision, risk, confidence, regressionStatus, repairCount, estimatedDurationMs, actualDurationMs);
    const regressionOutcome = regressionStatus === "PASS" || regressionStatus === "AUTO_FIXED"
      ? `${regressionStatus} — regression shield satisfied`
      : `${regressionStatus} — regression failures remain`;
    const recommendation = this._buildRecommendation(decision, risk, confidence, repairCount);

    return {
      id:               makeLessonId(),
      objective,
      problem,
      solution,
      lessonsLearned:   lessons,
      regressionOutcome,
      recommendation,
      timestamp:        Date.now(),
    };
  }

  // ── Self-improvement comparison ───────────────────────────────────────────

  compare(
    estimated: { durationMs: number; riskLevel: string; fileCount: number; confidence: number },
    actual:    { durationMs: number; riskLevel: string; fileCount: number; passed: boolean },
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const dRatio = estimated.durationMs > 0 ? actual.durationMs / estimated.durationMs : 1;
    result["Time accuracy"] = dRatio < 1.2 ? "GOOD (within 20%)" : dRatio < 2 ? "FAIR (20–100% over)" : `POOR (${Math.round(dRatio * 100 - 100)}% over estimate)`;
    result["Risk accuracy"] = estimated.riskLevel === actual.riskLevel ? "EXACT" : `Estimated=${estimated.riskLevel} Actual=${actual.riskLevel}`;
    result["Outcome"]       = actual.passed ? "PASS" : "FAIL";
    result["Confidence"]    = estimated.confidence >= 70 && actual.passed ? "Confidence was justified"
      : estimated.confidence >= 70 && !actual.passed ? "Confidence was OVERESTIMATED"
      : "Low confidence correctly predicted difficulty";
    return result;
  }

  private _inferProblem(objective: string, risk: RiskReport): string {
    if (risk.factors.length === 0) return `Implement: ${objective}`;
    return `${objective} — risk factors: ${risk.factors.map(f => f.description).slice(0, 2).join("; ")}`;
  }

  private _inferSolution(decision: StrategyDecision, repairCount: number): string {
    const base = `Strategy chosen: ${decision.strategy} — ${decision.rationale}`;
    return repairCount > 0 ? `${base}. Environment required ${repairCount} repair(s).` : base;
  }

  private _deriveLessons(
    decision: StrategyDecision,
    risk: RiskReport,
    confidence: ConfidenceResult,
    regressionStatus: RepairStatus,
    repairCount: number,
    estimatedMs: number,
    actualMs: number,
  ): string[] {
    const lessons: string[] = [];

    if (decision.strategy === "REUSE")
      lessons.push("Reuse path was validated — existing components reduced risk and implementation time");
    if (decision.strategy === "EXTEND")
      lessons.push("Extension strategy preserved backward compatibility — prefer EXTEND over CREATE when partial match exists");
    if (repairCount > 0)
      lessons.push(`Environment required ${repairCount} repair(s) — add pre-conditions check to future planning`);
    if (regressionStatus === "AUTO_FIXED")
      lessons.push("AUTO_FIXED — RepairEngine resolved regressions automatically without human intervention");
    if (regressionStatus === "FAIL")
      lessons.push("Regression failures remained after implementation — increase test coverage for affected components");
    if (confidence.score < 60)
      lessons.push("Low confidence was justified — invest in KG and Memory to improve future confidence scoring");
    if (actualMs > estimatedMs * 1.5)
      lessons.push("Actual duration significantly exceeded estimate — refine complexity model for similar objectives");
    if (risk.overallRisk === "HIGH" || risk.overallRisk === "CRITICAL")
      lessons.push(`${risk.overallRisk} risk materialized — validate stable components first on future HIGH/CRITICAL tasks`);

    if (lessons.length === 0)
      lessons.push("Execution went as planned — no adjustments needed for similar future implementations");

    return lessons;
  }

  private _buildRecommendation(
    decision: StrategyDecision,
    risk: RiskReport,
    confidence: ConfidenceResult,
    repairCount: number,
  ): string {
    if (repairCount > 2) return "Invest in environment stability — repeated repairs slow down delivery";
    if (confidence.score < 50) return "Build KG before next implementation — familiarity score too low";
    if (risk.overallRisk === "HIGH") return "Add regression tests for affected stable components before next sprint";
    if (decision.strategy === "CREATE" && confidence.score > 80) return "High confidence on new creation — safe to proceed autonomously";
    return "Implementation within normal parameters — continue current approach";
  }
}