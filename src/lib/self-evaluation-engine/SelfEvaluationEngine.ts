// Self Evaluation Engine v1.0
// Foundation v1.0 · Engineering First · Sprint 20
// Responsabilidade UNICA: avaliar a qualidade de uma execucao concluida.
// Recebe a Reflection produzida anteriormente e gera uma SelfEvaluation imutavel.
// NAO executa Goals. NAO modifica Reflection. NAO conversa com LLM. NAO aprende.

import type { DecisionResult }  from "@/lib/decision-engine/DecisionEngineTypes";
import type { ExecutionPlan }   from "@/lib/planning-engine/PlanningEngineTypes";
import type { Reflection }      from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { ExecutionResult } from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { ReflectionEngine } from "@/lib/reflection-engine/ReflectionEngine";
import type { PlanningEngine }  from "@/lib/planning-engine/PlanningEngine";
import type { DecisionEngine }  from "@/lib/decision-engine/DecisionEngine";
import {
  CLASSIFICATION_THRESHOLDS,
  type EvaluationClassification,
  type EvaluationHealth,
  type EvaluationLog,
  type EvaluationMetrics,
  type EvaluationStatistics,
  type EvaluationStatus,
  type SelfEvaluation,
} from "./SelfEvaluationEngineTypes";

function uid(): string {
  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fingerprint(goalId: string, executionId: string, reflectionId: string): string {
  return `${goalId}:${executionId}:${reflectionId}:${Date.now()}`;
}

export class SelfEvaluationEngine {
  private _evaluations = new Map<string, SelfEvaluation>();
  private _logs:       EvaluationLog[] = [];
  private _durations:  number[]        = [];
  private _metrics: EvaluationMetrics  = {
    evaluateTotal: 0, invalidateTotal: 0, archiveTotal: 0, avgDurationMs: 0,
  };

  constructor(
    private readonly reflectionEngine?: ReflectionEngine,
    private readonly planningEngine?: PlanningEngine,
    private readonly decisionEngine?: DecisionEngine,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  evaluate(
    reflection:  Reflection,
    result:      ExecutionResult,
    plan:        ExecutionPlan,
    decision:    DecisionResult,
  ): { success: boolean; evaluation?: SelfEvaluation; evaluationId?: string; error?: string } {
    const start        = Date.now();
    const execId       = uid();
    const evaluationId = uid();

    try {
      // ── Validation ───────────────────────────────────────────────────────
      if (!reflection?.reflectionId) return this._fail(execId, evaluationId, "unknown", "evaluate", start, "reflection.reflectionId is required");
      if (!reflection?.goalId)       return this._fail(execId, evaluationId, "unknown", "evaluate", start, "reflection.goalId is required");
      if (!result?.executionId)      return this._fail(execId, evaluationId, reflection.goalId, "evaluate", start, "result.executionId is required");
      if (!plan?.planId)             return this._fail(execId, evaluationId, reflection.goalId, "evaluate", start, "plan.planId is required");
      if (!decision?.decisionId)     return this._fail(execId, evaluationId, reflection.goalId, "evaluate", start, "decision.decisionId is required");

      // ── Score computation ─────────────────────────────────────────────────
      const performanceScore  = this._scorePerformance(reflection, result);
      const qualityScore      = this._scoreQuality(reflection, result, plan);
      const reliabilityScore  = this._scoreReliability(reflection, result);
      const consistencyScore  = this._scoreConsistency(reflection, plan, decision);
      const confidenceScore   = this._scoreConfidence(reflection, decision);
      const riskScore         = this._scoreRisk(reflection);
      const overallScore      = this._scoreOverall(
        performanceScore, qualityScore, reliabilityScore,
        consistencyScore, confidenceScore, riskScore,
      );

      const classification   = this._classify(overallScore);
      const strengths        = this._extractStrengths(reflection, overallScore, classification);
      const weaknesses       = this._extractWeaknesses(reflection, result, overallScore);
      const recommendations  = this._buildRecommendations(reflection, classification, decision);
      const improvementActions = this._buildImprovementActions(reflection, result, plan, overallScore);

      const requiresHumanReview = overallScore < 40 || classification === "FAILED" || reflection.riskLevel === "CRITICAL";
      const readyForLearning    = overallScore >= 55 && reflection.failures.length === 0;

      const summary = this._buildSummary(reflection, classification, overallScore);

      const evaluation = Object.freeze<SelfEvaluation>({
        evaluationId,
        goalId:       reflection.goalId,
        executionId:  reflection.executionId,
        reflectionId: reflection.reflectionId,
        status:       "EVALUATED" as EvaluationStatus,

        summary,
        classification,

        overallScore:     Math.round(overallScore),
        performanceScore: Math.round(performanceScore),
        qualityScore:     Math.round(qualityScore),
        reliabilityScore: Math.round(reliabilityScore),
        consistencyScore: Math.round(consistencyScore),
        confidenceScore:  Math.round(confidenceScore),
        riskScore:        Math.round(riskScore),

        strengths:          Object.freeze([...strengths]),
        weaknesses:         Object.freeze([...weaknesses]),
        recommendations:    Object.freeze([...recommendations]),
        improvementActions: Object.freeze([...improvementActions]),

        requiresHumanReview,
        readyForLearning,

        createdAt: Date.now(),

        // Forward-compat (v1.0 empty)
        evaluationFingerprint:  fingerprint(reflection.goalId, reflection.executionId, reflection.reflectionId),
        learningCandidates:     Object.freeze([]),
        knowledgeCandidates:    Object.freeze([]),
        optimizationCandidates: Object.freeze([]),
        automationCandidates:   Object.freeze([]),
        futureCapabilities:     Object.freeze([]),
        futureConnectors:       Object.freeze([]),
        executionSignature:     `${reflection.executionId}:${reflection.riskLevel}:${reflection.confidence}`,
        evaluationVersion:      "1.0.0",
        architectureVersion:    "1.0.0",
        foundationVersion:      "1.0.0",
      });

      this._evaluations.set(evaluationId, evaluation);
      this._metrics.evaluateTotal++;
      this._log(execId, evaluationId, reflection.goalId, "evaluate", start, true);
      return { success: true, evaluation, evaluationId };
    } catch (err) {
      return this._fail(execId, evaluationId, "unknown", "evaluate", start, String(err));
    }
  }

  invalidate(evaluationId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const ev = this._evaluations.get(evaluationId);
      if (!ev) return this._fail(execId, evaluationId, "unknown", "invalidate", start, `Evaluation not found: ${evaluationId}`);
      if (ev.status !== "EVALUATED") return this._fail(execId, evaluationId, ev.goalId, "invalidate", start, `Cannot invalidate in status ${ev.status}`);
      this._evaluations.set(evaluationId, Object.freeze({ ...ev, status: "INVALIDATED" as EvaluationStatus }));
      this._metrics.invalidateTotal++;
      this._log(execId, evaluationId, ev.goalId, "invalidate", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, evaluationId, "unknown", "invalidate", start, String(err));
    }
  }

  archive(evaluationId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const ev = this._evaluations.get(evaluationId);
      if (!ev) return this._fail(execId, evaluationId, "unknown", "archive", start, `Evaluation not found: ${evaluationId}`);
      if (ev.status === "ARCHIVED") return this._fail(execId, evaluationId, ev.goalId, "archive", start, "Already archived");
      this._evaluations.set(evaluationId, Object.freeze({ ...ev, status: "ARCHIVED" as EvaluationStatus }));
      this._metrics.archiveTotal++;
      this._log(execId, evaluationId, ev.goalId, "archive", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, evaluationId, "unknown", "archive", start, String(err));
    }
  }

  getEvaluation(evaluationId: string): SelfEvaluation | null {
    return this._evaluations.get(evaluationId) ?? null;
  }

  exists(evaluationId: string): boolean {
    return this._evaluations.has(evaluationId);
  }

  list(filterStatus?: EvaluationStatus): SelfEvaluation[] {
    const all = [...this._evaluations.values()];
    return filterStatus ? all.filter(e => e.status === filterStatus) : all;
  }

  statistics(): EvaluationStatistics {
    const all = [...this._evaluations.values()];
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const breakdown: Record<EvaluationClassification, number> = {
      EXCELLENT: 0, GOOD: 0, ACCEPTABLE: 0, POOR: 0, FAILED: 0,
    };
    all.forEach(ev => { breakdown[ev.classification]++; });
    return Object.freeze({
      totalEvaluated:           this._metrics.evaluateTotal,
      totalInvalidated:         this._metrics.invalidateTotal,
      totalArchived:            this._metrics.archiveTotal,
      avgOverallScore:          Math.round(avg(all.map(ev => ev.overallScore))),
      classificationBreakdown:  Object.freeze({ ...breakdown }),
      requiresHumanReviewCount: all.filter(ev => ev.requiresHumanReview).length,
      readyForLearningCount:    all.filter(ev => ev.readyForLearning).length,
    });
  }

  health(): EvaluationHealth {
    try {
      const all = [...this._evaluations.values()];

      const evaluationIntegrity = all.every(ev =>
        ev.evaluationId && ev.goalId && ev.executionId && ev.reflectionId && ev.createdAt > 0,
      );
      const scoreIntegrity = all.every(ev =>
        [ev.overallScore, ev.performanceScore, ev.qualityScore,
         ev.reliabilityScore, ev.consistencyScore, ev.confidenceScore, ev.riskScore]
        .every(s => s >= 0 && s <= 100),
      );
      const immutabilityCheck = all.every(ev => Object.isFrozen(ev));
      const consistencyCheck  =
        this._metrics.evaluateTotal >= this._metrics.invalidateTotal + this._metrics.archiveTotal;

      const ok = evaluationIntegrity && scoreIntegrity && immutabilityCheck && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { evaluationIntegrity, scoreIntegrity, immutabilityCheck, consistencyCheck },
        details: `evaluations=${all.length} evaluated=${this._metrics.evaluateTotal} invalidated=${this._metrics.invalidateTotal} archived=${this._metrics.archiveTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { evaluationIntegrity: false, scoreIntegrity: false, immutabilityCheck: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getLogs():    EvaluationLog[]    { return [...this._logs]; }
  getMetrics(): EvaluationMetrics  { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._evaluations.clear();
    this._logs      = [];
    this._durations = [];
    this._metrics   = { evaluateTotal: 0, invalidateTotal: 0, archiveTotal: 0, avgDurationMs: 0 };
  }

  // ── Score helpers (pure — no side effects) ─────────────────────────────────

  private _scorePerformance(ref: Reflection, result: ExecutionResult): number {
    const statusBase = { SUCCESS: 100, PARTIAL: 60, FAILED: 15, TIMEOUT: 25, CANCELLED: 10 }[result.status] ?? 15;
    const stepRatio  = result.stepsTotal > 0 ? (result.stepsExecuted / result.stepsTotal) * 100 : 0;
    const fallback   = Math.max(0, 100 - result.fallbacksUsed * 10);
    return Math.min(100, statusBase * 0.5 + stepRatio * 0.3 + fallback * 0.2);
  }

  private _scoreQuality(ref: Reflection, result: ExecutionResult, plan: ExecutionPlan): number {
    const stepCoverage = result.stepsTotal > 0 ? (result.stepsExecuted / result.stepsTotal) * 100 : 0;
    const errorPenalty = Math.max(0, 100 - result.errorMessages.length * 15);
    const onTime       = result.durationMs <= plan.estimatedMs
      ? 100
      : Math.max(20, 100 - ((result.durationMs - plan.estimatedMs) / plan.estimatedMs) * 50);
    const successScore = ref.successes.length > 0 ? Math.min(100, ref.successes.length * 20) : 40;
    return Math.min(100, stepCoverage * 0.35 + errorPenalty * 0.30 + onTime * 0.20 + successScore * 0.15);
  }

  private _scoreReliability(ref: Reflection, result: ExecutionResult): number {
    const base         = { SUCCESS: 100, PARTIAL: 65, FAILED: 20, TIMEOUT: 30, CANCELLED: 15 }[result.status] ?? 20;
    const fallbackCost = Math.min(40, result.fallbacksUsed * 12);
    const warnCost     = Math.min(20, result.warningMessages.length * 5);
    return Math.max(0, base - fallbackCost - warnCost);
  }

  private _scoreConsistency(ref: Reflection, plan: ExecutionPlan, decision: DecisionResult): number {
    // Consistency = alignment between decision confidence, plan complexity and actual outcome
    const decConf  = Math.round(decision.confidence * 100);
    const complexityPenalty = { LOW: 0, MEDIUM: 5, HIGH: 15, CRITICAL: 25 }[plan.complexity] ?? 0;
    const refConf  = { HIGH: 100, MEDIUM: 65, LOW: 30 }[ref.confidence] ?? 50;
    return Math.max(0, Math.min(100, (decConf * 0.4 + refConf * 0.4) - complexityPenalty * 0.2));
  }

  private _scoreConfidence(ref: Reflection, decision: DecisionResult): number {
    const refScore = { HIGH: 100, MEDIUM: 60, LOW: 25 }[ref.confidence] ?? 50;
    const decScore = Math.round(decision.confidence * 100);
    return Math.min(100, refScore * 0.6 + decScore * 0.4);
  }

  private _scoreRisk(ref: Reflection): number {
    // Risk score: higher = more risk (inverted for display: 100 = no risk, 0 = maximum risk)
    const raw = { LOW: 5, MEDIUM: 30, HIGH: 65, CRITICAL: 90 }[ref.riskLevel] ?? 50;
    return Math.max(0, 100 - raw);
  }

  private _scoreOverall(
    perf: number, qual: number, rel: number,
    cons: number, conf: number, risk: number,
  ): number {
    return Math.min(100,
      perf * 0.25 + qual * 0.25 + rel * 0.20 +
      cons * 0.10 + conf * 0.10 + risk * 0.10,
    );
  }

  private _classify(overallScore: number): EvaluationClassification {
    if (overallScore >= CLASSIFICATION_THRESHOLDS.EXCELLENT)  return "EXCELLENT";
    if (overallScore >= CLASSIFICATION_THRESHOLDS.GOOD)       return "GOOD";
    if (overallScore >= CLASSIFICATION_THRESHOLDS.ACCEPTABLE) return "ACCEPTABLE";
    if (overallScore >= CLASSIFICATION_THRESHOLDS.POOR)       return "POOR";
    return "FAILED";
  }

  // ── Evidence helpers ───────────────────────────────────────────────────────

  private _extractStrengths(ref: Reflection, score: number, cls: EvaluationClassification): string[] {
    const s: string[] = [...ref.successes];
    if (score >= 90)                s.push("Exceptional overall execution quality");
    if (ref.riskLevel === "LOW")    s.push("Minimal risk profile");
    if (ref.confidence === "HIGH")  s.push("High confidence in execution outcome");
    if (ref.failures.length === 0)  s.push("Zero failures recorded");
    if (ref.warnings.length === 0)  s.push("Zero warnings recorded");
    return s.slice(0, 6);
  }

  private _extractWeaknesses(ref: Reflection, result: ExecutionResult, score: number): string[] {
    const w: string[] = [...ref.failures];
    if (ref.riskLevel === "CRITICAL" || ref.riskLevel === "HIGH") w.push(`Elevated risk level: ${ref.riskLevel}`);
    if (ref.confidence === "LOW")   w.push("Low confidence in execution outcome");
    if (score < 55)                 w.push("Overall score below acceptable threshold");
    if (result.stepsSkipped > 0)   w.push(`${result.stepsSkipped} steps were skipped`);
    return w.slice(0, 6);
  }

  private _buildRecommendations(ref: Reflection, cls: EvaluationClassification, decision: DecisionResult): string[] {
    const r: string[] = [...ref.recommendations];
    if (cls === "FAILED" || cls === "POOR") r.push("Conduct root cause analysis before re-execution");
    if (decision.confidence < 0.5)          r.push("Improve decision confidence through richer candidate pool");
    if (ref.riskLevel === "CRITICAL")       r.push("Mandatory human review required before next attempt");
    if (cls === "EXCELLENT")                r.push("Capture this execution as a reference pattern");
    return r.slice(0, 6);
  }

  private _buildImprovementActions(
    ref: Reflection, result: ExecutionResult,
    plan: ExecutionPlan, score: number,
  ): string[] {
    const a: string[] = [...ref.improvementCandidates];
    if (result.fallbacksUsed > 0)         a.push("Audit and strengthen primary execution paths");
    if (result.durationMs > plan.estimatedMs * 1.2) a.push("Recalibrate step duration estimates");
    if (score < 75)                        a.push("Review plan complexity against execution capability");
    if (ref.lessonsLearned.length > 0)    a.push(`Apply ${ref.lessonsLearned.length} lessons to future planning`);
    return a.slice(0, 6);
  }

  private _buildSummary(ref: Reflection, cls: EvaluationClassification, score: number): string {
    return `Goal ${ref.goalId} evaluated as ${cls} (score=${score}/100) — confidence=${ref.confidence}, risk=${ref.riskLevel}, strengths=${ref.successes.length}, failures=${ref.failures.length}`;
  }

  // ── Internal log/fail ──────────────────────────────────────────────────────

  private _log(
    executionId: string, evaluationId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, evaluationId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, evaluationId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, evaluationId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}