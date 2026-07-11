// Reflection Engine v1.0
// Foundation v1.0 · Engineering First
// Responsabilidade UNICA: analisar o resultado de uma execucao e produzir uma Reflection imutavel.
// NAO executa Goals. NAO modifica Goals. NAO conversa com LLM. NAO interpreta intencao.
// NAO agenda. NAO despacha. NAO decide. NAO planeja.

import type { DecisionResult } from "@/lib/decision-engine/DecisionEngineTypes";
import type { ExecutionPlan }  from "@/lib/planning-engine/PlanningEngineTypes";
import type { PlanningEngine } from "@/lib/planning-engine/PlanningEngine";
import type { DecisionEngine } from "@/lib/decision-engine/DecisionEngine";
import {
  type ConfidenceLevel,
  type ExecutionMetrics,
  type ExecutionResult,
  type ImprovementPriority,
  type Reflection,
  type ReflectionHealth,
  type ReflectionLog,
  type ReflectionMetrics,
  type ReflectionStatistics,
  type ReflectionStatus,
  type RiskLevel,
} from "./ReflectionEngineTypes";

function uid(): string {
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ReflectionEngine {
  private _reflections = new Map<string, Reflection>();
  private _logs:       ReflectionLog[] = [];
  private _durations:  number[]        = [];
  private _metrics: ReflectionMetrics  = {
    generateTotal: 0, invalidateTotal: 0, archiveTotal: 0, avgDurationMs: 0,
  };

  constructor(
    private readonly planningEngine?: PlanningEngine,
    private readonly decisionEngine?: DecisionEngine,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  reflect(
    result:      ExecutionResult,
    plan:        ExecutionPlan,
    decision:    DecisionResult,
    metrics?:    ExecutionMetrics,
  ): { success: boolean; reflection?: Reflection; reflectionId?: string; error?: string } {
    const start        = Date.now();
    const execId       = uid();
    const reflectionId = uid();

    try {
      // ── Validation ───────────────────────────────────────────────────────
      if (!result?.executionId)  return this._fail(execId, reflectionId, "unknown", "reflect", start, "result.executionId is required");
      if (!result?.goalId)       return this._fail(execId, reflectionId, "unknown", "reflect", start, "result.goalId is required");
      if (!plan?.planId)         return this._fail(execId, reflectionId, result.goalId, "reflect", start, "plan.planId is required");
      if (!decision?.decisionId) return this._fail(execId, reflectionId, result.goalId, "reflect", start, "decision.decisionId is required");

      // ── Analysis ─────────────────────────────────────────────────────────
      const successes    = this._extractSuccesses(result, plan);
      const failures     = this._extractFailures(result);
      const warnings     = this._extractWarnings(result, metrics);
      const lessons      = this._extractLessons(result, plan);
      const improvements = this._extractImprovements(result, plan, metrics);
      const recommendations = this._buildRecommendations(result, plan, decision, metrics);

      const confidenceScore = this._computeConfidenceScore(result, decision, metrics);
      const confidence      = this._classifyConfidence(confidenceScore);
      const riskScore       = this._computeRiskScore(result, plan, metrics);
      const riskLevel       = this._classifyRisk(riskScore);

      const performanceScore  = this._computePerformanceScore(result, metrics);
      const qualityScore      = this._computeQualityScore(result, plan);
      const reliabilityScore  = this._computeReliabilityScore(result, metrics);
      const improvementPriority: ImprovementPriority =
        failures.length > 2 || riskLevel === "CRITICAL" ? "CRITICAL"
        : failures.length > 0 || riskLevel === "HIGH"   ? "HIGH"
        : warnings.length > 2                           ? "MEDIUM"
        : "LOW";

      const summary = this._buildSummary(result, plan, confidence, riskLevel);

      const reflection = Object.freeze<Reflection>({
        reflectionId,
        goalId:      result.goalId,
        executionId: result.executionId,
        planId:      plan.planId,
        status:      "GENERATED" as ReflectionStatus,

        summary,
        successes:    Object.freeze([...successes]),
        failures:     Object.freeze([...failures]),
        warnings:     Object.freeze([...warnings]),
        recommendations: Object.freeze([...recommendations]),
        lessonsLearned:  Object.freeze([...lessons]),
        improvementCandidates: Object.freeze([...improvements]),

        confidence,
        confidenceScore: Math.round(confidenceScore * 1000) / 1000,
        riskLevel,
        riskScore:    Math.round(riskScore * 1000) / 1000,

        executionDuration: result.durationMs,
        createdAt:         Date.now(),

        // MDS v1.7 forward-compatibility (empty in v1.0)
        requiredCapabilities:    Object.freeze([]),
        usedCapabilities:        Object.freeze([]),
        usedConnectors:          Object.freeze([]),
        dependencyGraph:         Object.freeze({}),
        preconditionsSatisfied:  result.status !== "FAILED",
        postconditionsSatisfied: result.status === "SUCCESS",
        retryCount:              0,
        rollbackExecuted:        false,
        performanceScore:        Math.round(performanceScore * 1000) / 1000,
        qualityScore:            Math.round(qualityScore * 1000) / 1000,
        reliabilityScore:        Math.round(reliabilityScore * 1000) / 1000,
        improvementPriority,
      });

      this._reflections.set(reflectionId, reflection);
      this._metrics.generateTotal++;
      this._log(execId, reflectionId, result.goalId, "reflect", start, true);
      return { success: true, reflection, reflectionId };
    } catch (err) {
      return this._fail(execId, reflectionId, "unknown", "reflect", start, String(err));
    }
  }

  invalidate(reflectionId: string, reason?: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const r = this._reflections.get(reflectionId);
      if (!r) return this._fail(execId, reflectionId, "unknown", "invalidate", start, `Reflection not found: ${reflectionId}`);
      if (r.status !== "GENERATED") return this._fail(execId, reflectionId, r.goalId, "invalidate", start, `Cannot invalidate in status ${r.status}`);
      this._reflections.set(reflectionId, Object.freeze({ ...r, status: "INVALIDATED" as ReflectionStatus }));
      this._metrics.invalidateTotal++;
      this._log(execId, reflectionId, r.goalId, "invalidate", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, reflectionId, "unknown", "invalidate", start, String(err));
    }
  }

  archive(reflectionId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const r = this._reflections.get(reflectionId);
      if (!r) return this._fail(execId, reflectionId, "unknown", "archive", start, `Reflection not found: ${reflectionId}`);
      if (r.status === "ARCHIVED") return this._fail(execId, reflectionId, r.goalId, "archive", start, "Already archived");
      this._reflections.set(reflectionId, Object.freeze({ ...r, status: "ARCHIVED" as ReflectionStatus }));
      this._metrics.archiveTotal++;
      this._log(execId, reflectionId, r.goalId, "archive", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, reflectionId, "unknown", "archive", start, String(err));
    }
  }

  getReflection(reflectionId: string): Reflection | null {
    return this._reflections.get(reflectionId) ?? null;
  }

  exists(reflectionId: string): boolean {
    return this._reflections.has(reflectionId);
  }

  list(filterStatus?: ReflectionStatus): Reflection[] {
    const all = [...this._reflections.values()];
    return filterStatus ? all.filter(r => r.status === filterStatus) : all;
  }

  statistics(): ReflectionStatistics {
    const all = [...this._reflections.values()];
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const confScores = all.map(r => r.confidenceScore);
    const riskScores = all.map(r => r.riskScore);
    const durations  = all.map(r => r.executionDuration);

    const confBreakdown = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    const riskBreakdown = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    all.forEach(r => {
      confBreakdown[r.confidence]++;
      riskBreakdown[r.riskLevel]++;
    });

    return Object.freeze({
      totalGenerated:       this._metrics.generateTotal,
      totalInvalidated:     this._metrics.invalidateTotal,
      totalArchived:        this._metrics.archiveTotal,
      avgConfidenceScore:   Math.round(avg(confScores) * 1000) / 1000,
      avgRiskScore:         Math.round(avg(riskScores) * 1000) / 1000,
      confidenceBreakdown:  Object.freeze({ ...confBreakdown }),
      riskBreakdown:        Object.freeze({ ...riskBreakdown }),
      avgExecutionDuration: Math.round(avg(durations)),
    });
  }

  health(): ReflectionHealth {
    try {
      const all = [...this._reflections.values()];

      const reflectionIntegrity = all.every(r =>
        r.reflectionId && r.goalId && r.executionId && r.planId && r.createdAt > 0,
      );
      const scoreIntegrity = all.every(r =>
        r.confidenceScore >= 0 && r.confidenceScore <= 1 &&
        r.riskScore       >= 0 && r.riskScore       <= 1,
      );
      const immutabilityCheck = all.every(r => Object.isFrozen(r));
      const consistencyCheck  =
        this._metrics.generateTotal >= this._metrics.invalidateTotal + this._metrics.archiveTotal;

      const ok = reflectionIntegrity && scoreIntegrity && immutabilityCheck && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { reflectionIntegrity, scoreIntegrity, immutabilityCheck, consistencyCheck },
        details: `reflections=${all.length} generated=${this._metrics.generateTotal} invalidated=${this._metrics.invalidateTotal} archived=${this._metrics.archiveTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { reflectionIntegrity: false, scoreIntegrity: false, immutabilityCheck: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getLogs():    ReflectionLog[]    { return [...this._logs]; }
  getMetrics(): ReflectionMetrics  { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._reflections.clear();
    this._logs      = [];
    this._durations = [];
    this._metrics   = { generateTotal: 0, invalidateTotal: 0, archiveTotal: 0, avgDurationMs: 0 };
  }

  // ── Analysis helpers (pure — no side effects) ──────────────────────────────

  private _extractSuccesses(result: ExecutionResult, plan: ExecutionPlan): string[] {
    const s: string[] = [];
    if (result.status === "SUCCESS")  s.push("Execution completed successfully");
    if (result.stepsExecuted === result.stepsTotal) s.push("All planned steps executed");
    if (result.fallbacksUsed === 0)   s.push("No fallbacks required");
    if (result.errorMessages.length === 0) s.push("Zero errors recorded");
    if (result.durationMs <= plan.estimatedMs) s.push(`Completed within estimated time (${result.durationMs}ms <= ${plan.estimatedMs}ms)`);
    return s;
  }

  private _extractFailures(result: ExecutionResult): string[] {
    const f: string[] = [];
    if (result.status === "FAILED")   f.push("Execution failed");
    if (result.status === "TIMEOUT")  f.push("Execution timed out");
    if (result.stepsSkipped > 0)      f.push(`${result.stepsSkipped} step(s) skipped`);
    result.errorMessages.forEach(e => f.push(`Error: ${e}`));
    return f;
  }

  private _extractWarnings(result: ExecutionResult, metrics?: ExecutionMetrics): string[] {
    const w: string[] = [];
    if (result.status === "PARTIAL")       w.push("Execution partially completed");
    if (result.fallbacksUsed > 0)          w.push(`${result.fallbacksUsed} fallback(s) used`);
    result.warningMessages.forEach(m => w.push(`Warning: ${m}`));
    if (metrics?.errorRate && metrics.errorRate > 0.1) w.push(`High error rate: ${Math.round(metrics.errorRate * 100)}%`);
    if (metrics?.latencyMs && metrics.latencyMs > 5000) w.push(`High latency: ${metrics.latencyMs}ms`);
    return w;
  }

  private _extractLessons(result: ExecutionResult, plan: ExecutionPlan): string[] {
    const l: string[] = [];
    if (result.durationMs > plan.estimatedMs * 1.5) l.push(`Execution exceeded estimate by ${Math.round((result.durationMs / plan.estimatedMs - 1) * 100)}%`);
    if (result.fallbacksUsed > 0) l.push("Fallback paths were activated — review primary step reliability");
    if (result.stepsSkipped > 0)  l.push("Some steps were skipped — verify precondition coverage");
    if (result.status === "SUCCESS" && result.errorMessages.length === 0) l.push("Clean execution — plan structure is sound");
    return l;
  }

  private _extractImprovements(result: ExecutionResult, plan: ExecutionPlan, metrics?: ExecutionMetrics): string[] {
    const i: string[] = [];
    if (result.durationMs > plan.estimatedMs) i.push("Refine step duration estimates");
    if (result.fallbacksUsed > 1)             i.push("Improve primary step reliability to reduce fallback usage");
    if (result.stepsSkipped > 0)              i.push("Review and fix skipped step preconditions");
    if (metrics?.errorRate && metrics.errorRate > 0.05) i.push("Reduce error rate below 5%");
    if (metrics?.successRate && metrics.successRate < 0.9) i.push("Target success rate >= 90%");
    return i;
  }

  private _buildRecommendations(
    result: ExecutionResult, plan: ExecutionPlan,
    decision: DecisionResult, metrics?: ExecutionMetrics,
  ): string[] {
    const r: string[] = [];
    if (result.status !== "SUCCESS") r.push("Review and fix execution failures before re-scheduling");
    if (decision.confidence < 0.6)   r.push("Improve decision confidence — consider enriching candidates");
    if (plan.complexity === "CRITICAL") r.push("Consider splitting high-complexity plan into sub-goals");
    if (result.durationMs > 10_000)  r.push("Evaluate async execution for long-running plans");
    if (result.fallbacksUsed > 0)    r.push("Audit fallback paths — ensure they meet quality thresholds");
    if (r.length === 0)              r.push("Execution nominal — maintain current plan structure");
    return r;
  }

  private _buildSummary(
    result: ExecutionResult, plan: ExecutionPlan,
    confidence: ConfidenceLevel, risk: RiskLevel,
  ): string {
    const statusLabel = { SUCCESS: "succeeded", PARTIAL: "partially completed", FAILED: "failed", TIMEOUT: "timed out", CANCELLED: "was cancelled" }[result.status] ?? result.status;
    return `Goal ${result.goalId} ${statusLabel} in ${result.durationMs}ms — plan complexity=${plan.complexity}, confidence=${confidence}, risk=${risk}, steps=${result.stepsExecuted}/${result.stepsTotal}`;
  }

  // ── Score computation ──────────────────────────────────────────────────────

  private _computeConfidenceScore(result: ExecutionResult, decision: DecisionResult, metrics?: ExecutionMetrics): number {
    const statusScore  = { SUCCESS: 1.0, PARTIAL: 0.6, FAILED: 0.2, TIMEOUT: 0.3, CANCELLED: 0.1 }[result.status] ?? 0.2;
    const stepScore    = result.stepsTotal > 0 ? result.stepsExecuted / result.stepsTotal : 0;
    const decScore     = Math.min(1, decision.confidence);
    const metricScore  = metrics ? metrics.successRate : 0.5;
    return Math.min(1, (statusScore * 0.35 + stepScore * 0.25 + decScore * 0.25 + metricScore * 0.15));
  }

  private _classifyConfidence(score: number): ConfidenceLevel {
    if (score >= 0.75) return "HIGH";
    if (score >= 0.45) return "MEDIUM";
    return "LOW";
  }

  private _computeRiskScore(result: ExecutionResult, plan: ExecutionPlan, metrics?: ExecutionMetrics): number {
    let risk = 0;
    if (result.status === "FAILED")    risk += 0.5;
    if (result.status === "TIMEOUT")   risk += 0.4;
    if (result.status === "PARTIAL")   risk += 0.25;
    if (result.fallbacksUsed > 0)      risk += 0.1 * Math.min(result.fallbacksUsed, 3);
    if (result.stepsSkipped > 0)       risk += 0.05 * Math.min(result.stepsSkipped, 4);
    if (plan.complexity === "CRITICAL") risk += 0.15;
    if (plan.complexity === "HIGH")     risk += 0.08;
    if (metrics?.errorRate)            risk += metrics.errorRate * 0.3;
    return Math.min(1, risk);
  }

  private _classifyRisk(score: number): RiskLevel {
    if (score >= 0.75) return "CRITICAL";
    if (score >= 0.50) return "HIGH";
    if (score >= 0.25) return "MEDIUM";
    return "LOW";
  }

  private _computePerformanceScore(result: ExecutionResult, metrics?: ExecutionMetrics): number {
    if (!metrics) return result.status === "SUCCESS" ? 0.7 : 0.3;
    return Math.min(1, (metrics.cpuScore * 0.3 + metrics.memoryScore * 0.2 + metrics.successRate * 0.35 + (1 - metrics.errorRate) * 0.15));
  }

  private _computeQualityScore(result: ExecutionResult, plan: ExecutionPlan): number {
    const stepCoverage = result.stepsTotal > 0 ? result.stepsExecuted / result.stepsTotal : 0;
    const noErrors     = result.errorMessages.length === 0 ? 1 : Math.max(0, 1 - result.errorMessages.length * 0.2);
    const onTime       = result.durationMs <= plan.estimatedMs ? 1 : Math.max(0.4, 1 - (result.durationMs - plan.estimatedMs) / plan.estimatedMs * 0.5);
    return Math.min(1, stepCoverage * 0.4 + noErrors * 0.35 + onTime * 0.25);
  }

  private _computeReliabilityScore(result: ExecutionResult, metrics?: ExecutionMetrics): number {
    const base = metrics ? metrics.successRate * 0.6 + (1 - metrics.errorRate) * 0.4 : (result.status === "SUCCESS" ? 0.8 : 0.3);
    const fallbackPenalty = Math.min(0.3, result.fallbacksUsed * 0.1);
    return Math.max(0, Math.min(1, base - fallbackPenalty));
  }

  // ── Internal log/fail ──────────────────────────────────────────────────────

  private _log(
    executionId: string, reflectionId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(this._durations.reduce((a, b) => a + b, 0) / this._durations.length);
    this._logs.push(Object.freeze({
      executionId, reflectionId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, reflectionId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, reflectionId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}