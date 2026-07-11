// Learning Engine v1.0
// Foundation v1.0 · Engineering First · Sprint 22
// Single Responsibility: Knowledge -> Learning (pure transform, no LLM, no DB, no side-effects).

import type { Knowledge } from "@/lib/knowledge-engine/KnowledgeEngineTypes";
import {
  LEARNING_QUALITY_THRESHOLD,
  type Learning,
  type LearningHealth,
  type LearningImportance,
  type LearningLog,
  type LearningMetrics,
  type LearningRejected,
  type LearningStatistics,
  type LearningStatus,
  type LearningType,
} from "./LearningEngineTypes";

const ALL_TYPES: LearningType[]       = ["LESSON","BEST_PRACTICE","WARNING","RULE","PATTERN","ANTI_PATTERN","OBSERVATION"];
const ALL_IMP:   LearningImportance[] = ["LOW","MEDIUM","HIGH","CRITICAL"];

function uid(): string {
  return `learn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class LearningEngine {
  private _learning   = new Map<string, Learning>();
  private _rejected:  LearningRejected[] = [];
  private _logs:      LearningLog[]      = [];
  private _durations: number[]           = [];
  private _metrics: LearningMetrics = { createTotal: 0, rejectTotal: 0, archiveTotal: 0, avgDurationMs: 0 };

  createLearning(knowledge: Knowledge): {
    success: boolean; learning?: Learning; learningId?: string;
    rejected?: LearningRejected; error?: string;
  } {
    const start      = Date.now();
    const learningId = uid();
    try {
      if (!knowledge?.knowledgeId)
        return this._fail(learningId, "unknown", "unknown", "createLearning", start, "knowledge.knowledgeId is required");
      if (!knowledge?.goalId)
        return this._fail(learningId, knowledge.knowledgeId, "unknown", "createLearning", start, "knowledge.goalId is required");

      // Quality Gate
      if (knowledge.status !== "ACTIVE")
        return this._reject(learningId, knowledge, start, `knowledge.status=${knowledge.status} -- only ACTIVE accepted`);
      if (knowledge.knowledgeScore < LEARNING_QUALITY_THRESHOLD)
        return this._reject(learningId, knowledge, start, `knowledgeScore=${knowledge.knowledgeScore} < threshold=${LEARNING_QUALITY_THRESHOLD}`);

      const insights        = Object.freeze([...knowledge.evidence.lessonsLearned, ...knowledge.evidence.strengths]);
      const patterns        = Object.freeze([...knowledge.evidence.improvementPatterns, ...knowledge.evidence.bestPractices]);
      const recommendations = Object.freeze([...knowledge.evidence.recommendations]);

      const metadata = Object.freeze({
        version:             "1.0.0",
        author:              "LearningEngine",
        language:            knowledge.metadata.language,
        sourceEngine:        "KnowledgeEngine",
        knowledgeVersion:    knowledge.knowledgeVersion,
        foundationVersion:   knowledge.foundationVersion,
        architectureVersion: knowledge.architectureVersion,
        createdBy:           "LearningEngine v1.0",
      });

      const learning = Object.freeze<Learning>({
        learningId,
        knowledgeId:  knowledge.knowledgeId,
        goalId:       knowledge.goalId,
        executionId:  knowledge.executionId,
        reflectionId: knowledge.reflectionId,
        evaluationId: knowledge.evaluationId,
        status:       "ACTIVE" as LearningStatus,

        // Mirror -- no re-derivation
        learningType:  knowledge.knowledgeType,
        confidence:    knowledge.confidence,
        importance:    knowledge.importance,
        learningScore: knowledge.knowledgeScore,

        title:   `Learning from ${knowledge.knowledgeType} -- ${knowledge.goalId}`,
        summary: `Transformed from Knowledge [score=${knowledge.knowledgeScore}] -- ${knowledge.summary.slice(0, 120)}`,

        insights, patterns, recommendations, metadata,
        createdAt: Date.now(),

        // Forward-compat
        learningFingerprint:   `${knowledge.knowledgeId}:${Date.now()}`,
        learningEmbedding:     Object.freeze([]),
        learningVector:        Object.freeze([]),
        learningCluster:       "",
        learningRelations:     Object.freeze([]),
        learningDependencies:  Object.freeze([]),
        learningConflicts:     Object.freeze([]),
        learningOpportunities: Object.freeze([]),
        futureCapabilities:    Object.freeze([]),
        futureConnectors:      Object.freeze([]),
      });

      this._learning.set(learningId, learning);
      this._metrics.createTotal++;
      this._log(learningId, knowledge.knowledgeId, knowledge.goalId, "createLearning", start, true);
      return { success: true, learning, learningId };
    } catch (err) {
      return this._fail(learningId, "unknown", "unknown", "createLearning", start, String(err));
    }
  }

  reject(learningId: string): { success: boolean; error?: string } {
    const start = Date.now();
    const l = this._learning.get(learningId);
    if (!l) return this._fail(learningId, "unknown", "unknown", "reject", start, `Not found: ${learningId}`);
    if (l.status !== "ACTIVE") return this._fail(learningId, l.knowledgeId, l.goalId, "reject", start, `Cannot reject in status ${l.status}`);
    this._learning.set(learningId, Object.freeze({ ...l, status: "REJECTED" as LearningStatus }));
    this._log(learningId, l.knowledgeId, l.goalId, "reject", start, true);
    return { success: true };
  }

  archive(learningId: string): { success: boolean; error?: string } {
    const start = Date.now();
    const l = this._learning.get(learningId);
    if (!l) return this._fail(learningId, "unknown", "unknown", "archive", start, `Not found: ${learningId}`);
    if (l.status === "ARCHIVED") return this._fail(learningId, l.knowledgeId, l.goalId, "archive", start, "Already archived");
    this._learning.set(learningId, Object.freeze({ ...l, status: "ARCHIVED" as LearningStatus }));
    this._metrics.archiveTotal++;
    this._log(learningId, l.knowledgeId, l.goalId, "archive", start, true);
    return { success: true };
  }

  exists(learningId: string):      boolean          { return this._learning.has(learningId); }
  getLearning(id: string):         Learning | null  { return this._learning.get(id) ?? null; }
  list(s?: LearningStatus):        Learning[]       { const a = [...this._learning.values()]; return s ? a.filter(l => l.status === s) : a; }
  getRejected():                   LearningRejected[] { return [...this._rejected]; }

  statistics(): LearningStatistics {
    const all = [...this._learning.values()];
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const byType: Record<LearningType, number>       = Object.fromEntries(ALL_TYPES.map(t => [t, 0])) as any;
    const byImp:  Record<LearningImportance, number> = Object.fromEntries(ALL_IMP.map(i => [i, 0])) as any;
    all.forEach(l => { byType[l.learningType]++; byImp[l.importance]++; });
    return Object.freeze({
      totalLearning:        this._metrics.createTotal,
      totalRejected:        this._metrics.rejectTotal + this._rejected.length,
      totalArchived:        this._metrics.archiveTotal,
      averageLearningScore: avg(all.map(l => l.learningScore)),
      learningByType:       Object.freeze({ ...byType }),
      learningByImportance: Object.freeze({ ...byImp }),
      readyForMemory:       all.filter(l => l.status === "ACTIVE").length,
    });
  }

  health(): LearningHealth {
    try {
      const all = [...this._learning.values()];
      const learningIntegrity    = all.every(l => l.learningId && l.knowledgeId && l.goalId && l.createdAt > 0);
      const immutabilityCheck    = all.every(l => Object.isFrozen(l));
      const scoreIntegrity       = all.every(l => l.learningScore >= 0 && l.learningScore <= 100);
      const pipelineIntegrity    = all.every(l => l.learningFingerprint && l.metadata.sourceEngine === "KnowledgeEngine");
      const forwardCompatibility = all.every(l => Array.isArray(l.learningEmbedding) && Array.isArray(l.learningRelations));
      const ok = learningIntegrity && immutabilityCheck && scoreIntegrity && pipelineIntegrity && forwardCompatibility;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { learningIntegrity, immutabilityCheck, scoreIntegrity, pipelineIntegrity, forwardCompatibility },
        details: `learning=${all.length} created=${this._metrics.createTotal} rejected=${this._metrics.rejectTotal + this._rejected.length} archived=${this._metrics.archiveTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { learningIntegrity: false, immutabilityCheck: false, scoreIntegrity: false, pipelineIntegrity: false, forwardCompatibility: false },
        details: String(err),
      };
    }
  }

  getLogs():    LearningLog[]    { return [...this._logs]; }
  getMetrics(): LearningMetrics  { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._learning.clear();
    this._rejected  = [];
    this._logs      = [];
    this._durations = [];
    this._metrics   = { createTotal: 0, rejectTotal: 0, archiveTotal: 0, avgDurationMs: 0 };
  }

  private _reject(learningId: string, k: Knowledge, start: number, reason: string): { success: boolean; rejected: LearningRejected } {
    const rejected: LearningRejected = Object.freeze({
      knowledgeId: k.knowledgeId, goalId: k.goalId, reason,
      knowledgeScore: k.knowledgeScore, knowledgeStatus: k.status, timestamp: Date.now(),
    });
    this._rejected.push(rejected);
    this._metrics.rejectTotal++;
    this._log(learningId, k.knowledgeId, k.goalId, "createLearning(rejected)", start, true);
    return { success: true, rejected };
  }

  private _log(learningId: string, knowledgeId: string, goalId: string, operation: string, start: number, success: boolean, error?: string): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(this._durations.reduce((a, b) => a + b, 0) / this._durations.length);
    this._logs.push(Object.freeze({ learningId, knowledgeId, goalId, operation, status: success ? "SUCCESS" : "FAILED", timestamp: Date.now(), duration, error }));
  }

  private _fail(learningId: string, knowledgeId: string, goalId: string, operation: string, start: number, error: string): { success: boolean; error: string } {
    this._log(learningId, knowledgeId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}