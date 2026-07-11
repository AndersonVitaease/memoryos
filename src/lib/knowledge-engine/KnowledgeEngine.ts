// Knowledge Engine v1.0
// Foundation v1.0 · Engineering First · Sprint 21
// Responsabilidade UNICA: transformar uma SelfEvaluation aprovada em Knowledge estruturado.
// NAO executa Goals. NAO modifica Reflection/SelfEvaluation. NAO acessa Memory. NAO usa LLM.
// NAO gera embeddings reais. Apenas filtra qualidade e produz Knowledge imutavel.

import type { SelfEvaluation }  from "@/lib/self-evaluation-engine/SelfEvaluationEngineTypes";
import type { Reflection }      from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { ExecutionResult } from "@/lib/reflection-engine/ReflectionEngineTypes";
import type { ExecutionPlan }   from "@/lib/planning-engine/PlanningEngineTypes";
import type { DecisionResult }  from "@/lib/decision-engine/DecisionEngineTypes";
import {
  KNOWLEDGE_QUALITY_THRESHOLD,
  type Knowledge,
  type KnowledgeConfidence,
  type KnowledgeHealth,
  type KnowledgeImportance,
  type KnowledgeLog,
  type KnowledgeMetrics,
  type KnowledgeRejected,
  type KnowledgeStatistics,
  type KnowledgeStatus,
  type KnowledgeType,
} from "./KnowledgeEngineTypes";

function uid(): string {
  return `know-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALL_KNOWLEDGE_TYPES: KnowledgeType[] = ["LESSON","BEST_PRACTICE","WARNING","RULE","PATTERN","ANTI_PATTERN","OBSERVATION"];
const ALL_IMPORTANCE: KnowledgeImportance[] = ["LOW","MEDIUM","HIGH","CRITICAL"];

export class KnowledgeEngine {
  private _knowledge  = new Map<string, Knowledge>();
  private _rejected:  KnowledgeRejected[] = [];
  private _logs:      KnowledgeLog[]      = [];
  private _durations: number[]            = [];
  private _metrics: KnowledgeMetrics = {
    createTotal: 0, rejectTotal: 0, archiveTotal: 0, avgDurationMs: 0,
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  createKnowledge(
    evaluation: SelfEvaluation,
    reflection: Reflection,
    result:     ExecutionResult,
    plan:       ExecutionPlan,
    decision:   DecisionResult,
  ): { success: boolean; knowledge?: Knowledge; knowledgeId?: string; rejected?: KnowledgeRejected; error?: string } {
    const start       = Date.now();
    const execId      = uid();
    const knowledgeId = uid();

    try {
      // ── Validation ───────────────────────────────────────────────────────
      if (!evaluation?.evaluationId) return this._fail(execId, knowledgeId, "unknown", "createKnowledge", start, "evaluation.evaluationId is required");
      if (!evaluation?.goalId)       return this._fail(execId, knowledgeId, "unknown", "createKnowledge", start, "evaluation.goalId is required");
      if (!reflection?.reflectionId) return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start, "reflection.reflectionId is required");
      if (!result?.executionId)      return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start, "result.executionId is required");
      if (!plan?.planId)             return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start, "plan.planId is required");
      if (!decision?.decisionId)     return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start, "decision.decisionId is required");

      // ── Pipeline integrity check ──────────────────────────────────────────
      if (evaluation.goalId !== reflection.goalId) {
        return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start,
          `Pipeline inconsistency: evaluation.goalId=${evaluation.goalId} != reflection.goalId=${reflection.goalId}`);
      }
      if (evaluation.executionId !== result.executionId) {
        return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start,
          `Pipeline inconsistency: evaluation.executionId=${evaluation.executionId} != result.executionId=${result.executionId}`);
      }
      if (evaluation.reflectionId !== reflection.reflectionId) {
        return this._fail(execId, knowledgeId, evaluation.goalId, "createKnowledge", start,
          `Pipeline inconsistency: evaluation.reflectionId=${evaluation.reflectionId} != reflection.reflectionId=${reflection.reflectionId}`);
      }

      // ── Quality gate ──────────────────────────────────────────────────────
      if (!evaluation.readyForLearning || evaluation.overallScore < KNOWLEDGE_QUALITY_THRESHOLD) {
        const rejected: KnowledgeRejected = Object.freeze({
          goalId:       evaluation.goalId,
          executionId:  evaluation.executionId,
          reason:       !evaluation.readyForLearning
            ? `readyForLearning=false`
            : `overallScore=${evaluation.overallScore} < threshold=${KNOWLEDGE_QUALITY_THRESHOLD}`,
          overallScore: evaluation.overallScore,
          readyForLearning: evaluation.readyForLearning,
          timestamp:    Date.now(),
        });
        this._rejected.push(rejected);
        this._metrics.rejectTotal++;
        this._log(execId, knowledgeId, evaluation.goalId, "createKnowledge", start, true);
        return { success: true, rejected };
      }

      // ── Derive knowledge attributes ───────────────────────────────────────
      const knowledgeType  = this._deriveType(evaluation, reflection);
      const importance     = this._deriveImportance(evaluation);
      const confidence     = this._deriveConfidence(evaluation, reflection);
      const knowledgeScore = this._computeKnowledgeScore(evaluation, reflection);
      const title          = this._buildTitle(evaluation, knowledgeType);
      const summary        = this._buildSummary(evaluation, reflection, knowledgeType);

      // ── Build evidence ────────────────────────────────────────────────────
      const evidence = Object.freeze({
        strengths:           Object.freeze([...evaluation.strengths]),
        weaknesses:          Object.freeze([...evaluation.weaknesses]),
        recommendations:     Object.freeze([...evaluation.recommendations]),
        lessonsLearned:      Object.freeze([...reflection.lessonsLearned]),
        bestPractices:       Object.freeze(this._extractBestPractices(evaluation, reflection)),
        antiPatterns:        Object.freeze(this._extractAntiPatterns(reflection)),
        improvementPatterns: Object.freeze([...reflection.improvementCandidates]),
      });

      // ── Build metadata ────────────────────────────────────────────────────
      const metadata = Object.freeze({
        domain:   this._deriveDomain(plan),
        category: evaluation.classification,
        tags:     Object.freeze([knowledgeType, evaluation.classification, reflection.confidence]),
        keywords: Object.freeze(this._extractKeywords(evaluation, reflection)),
        version:  "1.0.0",
        author:   "KnowledgeEngine",
        language: "en",
      });

      const knowledge = Object.freeze<Knowledge>({
        knowledgeId,
        goalId:        evaluation.goalId,
        executionId:   evaluation.executionId,
        reflectionId:  reflection.reflectionId,
        evaluationId:  evaluation.evaluationId,
        status:        "ACTIVE" as KnowledgeStatus,

        title,
        summary,
        knowledgeType,

        confidence,
        importance,
        qualityScore:   evaluation.overallScore,
        knowledgeScore: Math.round(knowledgeScore),

        source: `${evaluation.evaluationId}::${evaluation.classification}`,

        evidence,
        metadata,

        createdAt: Date.now(),

        // Forward-compat (v1.0 empty)
        knowledgeFingerprint:   `${evaluation.evaluationId}:${reflection.reflectionId}:${Date.now()}`,
        knowledgeEmbedding:     Object.freeze([]),
        knowledgeVector:        Object.freeze([]),
        knowledgeCluster:       "",
        knowledgeRelations:     Object.freeze([]),
        knowledgeDependencies:  Object.freeze([]),
        knowledgeConflicts:     Object.freeze([]),
        knowledgeOpportunities: Object.freeze([]),
        futureCapabilities:     Object.freeze([]),
        futureConnectors:       Object.freeze([]),
        knowledgeVersion:       "1.0.0",
        architectureVersion:    "1.0.0",
        foundationVersion:      "1.0.0",
      });

      this._knowledge.set(knowledgeId, knowledge);
      this._metrics.createTotal++;
      this._log(execId, knowledgeId, evaluation.goalId, "createKnowledge", start, true);
      return { success: true, knowledge, knowledgeId };
    } catch (err) {
      return this._fail(execId, knowledgeId, "unknown", "createKnowledge", start, String(err));
    }
  }

  reject(knowledgeId: string, reason?: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const k = this._knowledge.get(knowledgeId);
      if (!k) return this._fail(execId, knowledgeId, "unknown", "reject", start, `Knowledge not found: ${knowledgeId}`);
      if (k.status !== "ACTIVE") return this._fail(execId, knowledgeId, k.goalId, "reject", start, `Cannot reject in status ${k.status}`);
      this._knowledge.set(knowledgeId, Object.freeze({ ...k, status: "REJECTED" as KnowledgeStatus }));
      this._log(execId, knowledgeId, k.goalId, "reject", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, knowledgeId, "unknown", "reject", start, String(err));
    }
  }

  archive(knowledgeId: string): { success: boolean; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      const k = this._knowledge.get(knowledgeId);
      if (!k) return this._fail(execId, knowledgeId, "unknown", "archive", start, `Knowledge not found: ${knowledgeId}`);
      if (k.status === "ARCHIVED") return this._fail(execId, knowledgeId, k.goalId, "archive", start, "Already archived");
      this._knowledge.set(knowledgeId, Object.freeze({ ...k, status: "ARCHIVED" as KnowledgeStatus }));
      this._metrics.archiveTotal++;
      this._log(execId, knowledgeId, k.goalId, "archive", start, true);
      return { success: true };
    } catch (err) {
      return this._fail(execId, knowledgeId, "unknown", "archive", start, String(err));
    }
  }

  getKnowledge(knowledgeId: string): Knowledge | null {
    return this._knowledge.get(knowledgeId) ?? null;
  }

  exists(knowledgeId: string): boolean {
    return this._knowledge.has(knowledgeId);
  }

  list(filterStatus?: KnowledgeStatus): Knowledge[] {
    const all = [...this._knowledge.values()];
    return filterStatus ? all.filter(k => k.status === filterStatus) : all;
  }

  getRejected(): KnowledgeRejected[] {
    return [...this._rejected];
  }

  statistics(): KnowledgeStatistics {
    const all  = [...this._knowledge.values()];
    const avg  = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const byType: Record<KnowledgeType, number> = Object.fromEntries(ALL_KNOWLEDGE_TYPES.map(t => [t, 0])) as Record<KnowledgeType, number>;
    const byImp:  Record<KnowledgeImportance, number> = Object.fromEntries(ALL_IMPORTANCE.map(i => [i, 0])) as Record<KnowledgeImportance, number>;
    all.forEach(k => { byType[k.knowledgeType]++; byImp[k.importance]++; });
    return Object.freeze({
      totalKnowledge:        this._metrics.createTotal,
      totalRejected:         this._metrics.rejectTotal + this._rejected.length,
      totalArchived:         this._metrics.archiveTotal,
      averageKnowledgeScore: Math.round(avg(all.map(k => k.knowledgeScore))),
      knowledgeByType:       Object.freeze({ ...byType }),
      knowledgeByImportance: Object.freeze({ ...byImp }),
      knowledgeReadyForMemory: all.filter(k => k.status === "ACTIVE").length,
    });
  }

  health(): KnowledgeHealth {
    try {
      const all = [...this._knowledge.values()];

      const knowledgeIntegrity = all.every(k =>
        k.knowledgeId && k.goalId && k.executionId && k.reflectionId && k.evaluationId && k.createdAt > 0,
      );
      const immutabilityCheck = all.every(k => Object.isFrozen(k));
      const scoreIntegrity    = all.every(k =>
        k.qualityScore >= 0 && k.qualityScore <= 100 &&
        k.knowledgeScore >= 0 && k.knowledgeScore <= 100,
      );
      const pipelineIntegrity = all.every(k =>
        k.knowledgeFingerprint && k.source,
      );
      const forwardCompatibility = all.every(k =>
        Array.isArray(k.knowledgeEmbedding) &&
        Array.isArray(k.knowledgeRelations) &&
        typeof k.knowledgeVersion === "string",
      );

      const ok = knowledgeIntegrity && immutabilityCheck && scoreIntegrity && pipelineIntegrity && forwardCompatibility;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { knowledgeIntegrity, immutabilityCheck, scoreIntegrity, pipelineIntegrity, forwardCompatibility },
        details: `knowledge=${all.length} created=${this._metrics.createTotal} rejected=${this._metrics.rejectTotal + this._rejected.length} archived=${this._metrics.archiveTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { knowledgeIntegrity: false, immutabilityCheck: false, scoreIntegrity: false, pipelineIntegrity: false, forwardCompatibility: false },
        details: String(err),
      };
    }
  }

  getLogs():    KnowledgeLog[]    { return [...this._logs]; }
  getMetrics(): KnowledgeMetrics  { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._knowledge.clear();
    this._rejected  = [];
    this._logs      = [];
    this._durations = [];
    this._metrics   = { createTotal: 0, rejectTotal: 0, archiveTotal: 0, avgDurationMs: 0 };
  }

  // ── Derivation helpers (pure) ──────────────────────────────────────────────

  private _deriveType(ev: SelfEvaluation, ref: Reflection): KnowledgeType {
    if (ref.failures.length > 0 && ev.overallScore < 55)        return "ANTI_PATTERN";
    if (ref.failures.length > 0)                                 return "WARNING";
    if (ev.classification === "EXCELLENT" && ref.failures.length === 0) return "BEST_PRACTICE";
    if (ref.lessonsLearned.length > 0)                           return "LESSON";
    if (ev.classification === "GOOD")                            return "PATTERN";
    if (ev.requiresHumanReview)                                  return "RULE";
    return "OBSERVATION";
  }

  private _deriveImportance(ev: SelfEvaluation): KnowledgeImportance {
    if (ev.overallScore >= 90) return "CRITICAL";
    if (ev.overallScore >= 75) return "HIGH";
    if (ev.overallScore >= 55) return "MEDIUM";
    return "LOW";
  }

  private _deriveConfidence(ev: SelfEvaluation, ref: Reflection): KnowledgeConfidence {
    const score = (ev.confidenceScore + (ref.confidenceScore ?? 0) * 100) / 2;
    if (score >= 75) return "HIGH";
    if (score >= 45) return "MEDIUM";
    return "LOW";
  }

  private _computeKnowledgeScore(ev: SelfEvaluation, ref: Reflection): number {
    const base        = ev.overallScore;
    const refBonus    = ref.successes.length > 0 ? Math.min(10, ref.successes.length * 2) : 0;
    const lessonBonus = ref.lessonsLearned.length > 0 ? Math.min(5, ref.lessonsLearned.length) : 0;
    const failPenalty = ref.failures.length > 0 ? Math.min(15, ref.failures.length * 5) : 0;
    return Math.min(100, Math.max(0, base + refBonus + lessonBonus - failPenalty));
  }

  private _buildTitle(ev: SelfEvaluation, type: KnowledgeType): string {
    const typeLabel: Record<KnowledgeType, string> = {
      LESSON:        "Lesson",
      BEST_PRACTICE: "Best Practice",
      WARNING:       "Warning",
      RULE:          "Rule",
      PATTERN:       "Pattern",
      ANTI_PATTERN:  "Anti-Pattern",
      OBSERVATION:   "Observation",
    };
    return `${typeLabel[type]} from Goal ${ev.goalId} [${ev.classification}]`;
  }

  private _buildSummary(ev: SelfEvaluation, ref: Reflection, type: KnowledgeType): string {
    return `${type} derived from ${ev.classification} execution — score=${ev.overallScore}/100, confidence=${ref.confidence}, risk=${ref.riskLevel}. ${ev.summary.slice(0, 120)}`;
  }

  private _extractBestPractices(ev: SelfEvaluation, ref: Reflection): string[] {
    const practices: string[] = [];
    if (ev.classification === "EXCELLENT") practices.push("Full execution success pattern confirmed");
    if (ref.failures.length === 0)         practices.push("Zero-failure execution pathway");
    practices.push(...ev.strengths.slice(0, 3));
    return practices.slice(0, 5);
  }

  private _extractAntiPatterns(ref: Reflection): string[] {
    return ref.failures.slice(0, 5);
  }

  private _extractKeywords(ev: SelfEvaluation, ref: Reflection): string[] {
    const kw: string[] = [
      ev.classification.toLowerCase(),
      ref.confidence.toLowerCase(),
      ref.riskLevel.toLowerCase(),
    ];
    if (ev.readyForLearning) kw.push("ready-for-learning");
    if (ev.requiresHumanReview) kw.push("human-review");
    return kw;
  }

  private _deriveDomain(plan: ExecutionPlan): string {
    return `complexity-${plan.complexity.toLowerCase()}`;
  }

  // ── Internal log/fail ──────────────────────────────────────────────────────

  private _log(
    executionId: string, knowledgeId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, knowledgeId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, knowledgeId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, knowledgeId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}