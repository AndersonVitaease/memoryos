// Memory Engine v1.0
// Foundation v1.0 · Engineering First · Sprint 23
// Single Responsibility: Learning -> Memory (pure transform, no LLM, no DB, no side-effects).
// NOT executing Goals. NOT modifying Decision/Planning/Reflection/SelfEvaluation/Knowledge/Learning.
// NOT generating real embeddings. NOT using vector search. NOT implementing retrieval (Sprint 24+).

import type { Learning } from "@/lib/learning-engine/LearningEngineTypes";
import {
  MEMORY_QUALITY_THRESHOLD,
  type Memory,
  type MemoryHealth,
  type MemoryImportance,
  type MemoryLog,
  type MemoryMetrics,
  type MemoryRejected,
  type MemoryStatistics,
  type MemoryStatus,
  type MemoryType,
} from "./MemoryEngineTypes";

const ALL_TYPES: MemoryType[]       = ["LESSON","BEST_PRACTICE","WARNING","RULE","PATTERN","ANTI_PATTERN","OBSERVATION"];
const ALL_IMP:   MemoryImportance[] = ["LOW","MEDIUM","HIGH","CRITICAL"];

function uid(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class MemoryEngine {
  private _memory    = new Map<string, Memory>();
  private _rejected: MemoryRejected[] = [];
  private _logs:     MemoryLog[]      = [];
  private _durations: number[]        = [];
  private _metrics: MemoryMetrics = { createTotal: 0, rejectTotal: 0, archiveTotal: 0, avgDurationMs: 0 };

  // ── Public API ───────────────────────────────────────────────────────────────

  createMemory(learning: Learning): {
    success: boolean; memory?: Memory; memoryId?: string;
    rejected?: MemoryRejected; error?: string;
  } {
    const start    = Date.now();
    const memoryId = uid();

    try {
      // ── Validation ───────────────────────────────────────────────────────────
      if (!learning?.learningId)
        return this._fail(memoryId, "unknown", "unknown", "createMemory", start, "learning.learningId is required");
      if (!learning?.goalId)
        return this._fail(memoryId, learning.learningId, "unknown", "createMemory", start, "learning.goalId is required");
      if (!learning?.knowledgeId)
        return this._fail(memoryId, learning.learningId, learning.goalId, "createMemory", start, "learning.knowledgeId is required");
      if (!learning?.executionId)
        return this._fail(memoryId, learning.learningId, learning.goalId, "createMemory", start, "learning.executionId is required");
      if (!learning?.reflectionId)
        return this._fail(memoryId, learning.learningId, learning.goalId, "createMemory", start, "learning.reflectionId is required");
      if (!learning?.evaluationId)
        return this._fail(memoryId, learning.learningId, learning.goalId, "createMemory", start, "learning.evaluationId is required");

      // ── Memory Gate ──────────────────────────────────────────────────────────
      if (learning.status !== "ACTIVE")
        return this._reject(memoryId, learning, start, `learning.status=${learning.status} -- only ACTIVE accepted`);
      if (learning.learningScore < MEMORY_QUALITY_THRESHOLD)
        return this._reject(memoryId, learning, start, `learningScore=${learning.learningScore} < threshold=${MEMORY_QUALITY_THRESHOLD}`);

      // ── Evidence (direct transform — no content change) ───────────────────────
      const evidence = Object.freeze({
        insights:        Object.freeze([...learning.insights]),
        patterns:        Object.freeze([...learning.patterns]),
        recommendations: Object.freeze([...learning.recommendations]),
      });

      // ── Metadata ─────────────────────────────────────────────────────────────
      const metadata = Object.freeze({
        version:             "1.0.0",
        author:              "MemoryEngine",
        language:            learning.metadata.language,
        sourceEngine:        "LearningEngine",
        learningVersion:     learning.metadata.version,
        knowledgeVersion:    learning.metadata.knowledgeVersion,
        foundationVersion:   learning.metadata.foundationVersion,
        architectureVersion: learning.metadata.architectureVersion,
        createdBy:           "MemoryEngine v1.0",
      });

      // ── Build Memory (Mirror Principle — no recalculation) ────────────────────
      const memory = Object.freeze<Memory>({
        memoryId,
        learningId:   learning.learningId,
        knowledgeId:  learning.knowledgeId,
        goalId:       learning.goalId,
        executionId:  learning.executionId,
        reflectionId: learning.reflectionId,
        evaluationId: learning.evaluationId,
        status:       "ACTIVE" as MemoryStatus,

        // Mirror
        memoryType:  learning.learningType,
        memoryScore: learning.learningScore,
        importance:  learning.importance,
        confidence:  learning.confidence,

        title:   `Memory from ${learning.learningType} -- ${learning.goalId}`,
        summary: `Stored from Learning [score=${learning.learningScore}] -- ${learning.summary.slice(0, 120)}`,

        evidence,
        metadata,

        createdAt: Date.now(),

        // Forward-compatibility (empty in v1.0)
        memoryFingerprint:   `${learning.learningId}:${Date.now()}`,
        memoryEmbedding:     Object.freeze([]),
        memoryVector:        Object.freeze([]),
        memoryCluster:       "",
        memoryRelations:     Object.freeze([]),
        memoryDependencies:  Object.freeze([]),
        memoryConflicts:     Object.freeze([]),
        memoryOpportunities: Object.freeze([]),
        futureCapabilities:  Object.freeze([]),
        futureConnectors:    Object.freeze([]),
        memoryVersion:       "1.0.0",
        architectureVersion: "1.0.0",
        foundationVersion:   "1.0.0",
      });

      this._memory.set(memoryId, memory);
      this._metrics.createTotal++;
      this._log(memoryId, learning.learningId, learning.goalId, "createMemory", start, true);
      return { success: true, memory, memoryId };

    } catch (err) {
      return this._fail(memoryId, "unknown", "unknown", "createMemory", start, String(err));
    }
  }

  reject(memoryId: string): { success: boolean; error?: string } {
    const start = Date.now();
    const m = this._memory.get(memoryId);
    if (!m) return this._fail(memoryId, "unknown", "unknown", "reject", start, `Not found: ${memoryId}`);
    if (m.status !== "ACTIVE") return this._fail(memoryId, m.learningId, m.goalId, "reject", start, `Cannot reject in status ${m.status}`);
    this._memory.set(memoryId, Object.freeze({ ...m, status: "REJECTED" as MemoryStatus }));
    this._log(memoryId, m.learningId, m.goalId, "reject", start, true);
    return { success: true };
  }

  archive(memoryId: string): { success: boolean; error?: string } {
    const start = Date.now();
    const m = this._memory.get(memoryId);
    if (!m) return this._fail(memoryId, "unknown", "unknown", "archive", start, `Not found: ${memoryId}`);
    if (m.status === "ARCHIVED") return this._fail(memoryId, m.learningId, m.goalId, "archive", start, "Already archived");
    this._memory.set(memoryId, Object.freeze({ ...m, status: "ARCHIVED" as MemoryStatus }));
    this._metrics.archiveTotal++;
    this._log(memoryId, m.learningId, m.goalId, "archive", start, true);
    return { success: true };
  }

  exists(memoryId: string):   boolean        { return this._memory.has(memoryId); }
  getMemory(id: string):      Memory | null  { return this._memory.get(id) ?? null; }
  list(s?: MemoryStatus):     Memory[]       { const a = [...this._memory.values()]; return s ? a.filter(m => m.status === s) : a; }
  getRejected():              MemoryRejected[] { return [...this._rejected]; }

  statistics(): MemoryStatistics {
    const all  = [...this._memory.values()];
    const avg  = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const byType: Record<MemoryType, number>       = Object.fromEntries(ALL_TYPES.map(t => [t, 0])) as any;
    const byImp:  Record<MemoryImportance, number> = Object.fromEntries(ALL_IMP.map(i => [i, 0])) as any;
    all.forEach(m => { byType[m.memoryType]++; byImp[m.importance]++; });
    return Object.freeze({
      totalMemory:        this._metrics.createTotal,
      totalRejected:      this._metrics.rejectTotal + this._rejected.length,
      totalArchived:      this._metrics.archiveTotal,
      averageMemoryScore: avg(all.map(m => m.memoryScore)),
      memoryByType:       Object.freeze({ ...byType }),
      memoryByImportance: Object.freeze({ ...byImp }),
      readyForRetrieval:  all.filter(m => m.status === "ACTIVE").length,
    });
  }

  health(): MemoryHealth {
    try {
      const all = [...this._memory.values()];
      const memoryIntegrity   = all.every(m => m.memoryId && m.learningId && m.goalId && m.knowledgeId && m.createdAt > 0);
      const immutabilityCheck = all.every(m => Object.isFrozen(m) && Object.isFrozen(m.evidence) && Object.isFrozen(m.metadata));
      const scoreIntegrity    = all.every(m => m.memoryScore >= 0 && m.memoryScore <= 100);
      const pipelineIntegrity = all.every(m =>
        m.memoryFingerprint && m.metadata.sourceEngine === "LearningEngine" &&
        m.executionId && m.reflectionId && m.evaluationId && m.knowledgeId && m.learningId,
      );
      const forwardCompatibility = all.every(m =>
        Array.isArray(m.memoryEmbedding) && Array.isArray(m.memoryRelations) &&
        typeof m.memoryVersion === "string" && typeof m.foundationVersion === "string",
      );
      const ok = memoryIntegrity && immutabilityCheck && scoreIntegrity && pipelineIntegrity && forwardCompatibility;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { memoryIntegrity, immutabilityCheck, scoreIntegrity, pipelineIntegrity, forwardCompatibility },
        details: `memory=${all.length} created=${this._metrics.createTotal} rejected=${this._metrics.rejectTotal + this._rejected.length} archived=${this._metrics.archiveTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { memoryIntegrity: false, immutabilityCheck: false, scoreIntegrity: false, pipelineIntegrity: false, forwardCompatibility: false },
        details: String(err),
      };
    }
  }

  getLogs():    MemoryLog[]    { return [...this._logs]; }
  getMetrics(): MemoryMetrics  { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._memory.clear();
    this._rejected  = [];
    this._logs      = [];
    this._durations = [];
    this._metrics   = { createTotal: 0, rejectTotal: 0, archiveTotal: 0, avgDurationMs: 0 };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _reject(memoryId: string, l: Learning, start: number, reason: string): { success: boolean; rejected: MemoryRejected } {
    const rejected: MemoryRejected = Object.freeze({
      learningId: l.learningId, goalId: l.goalId, reason,
      learningScore: l.learningScore, learningStatus: l.status, timestamp: Date.now(),
    });
    this._rejected.push(rejected);
    this._metrics.rejectTotal++;
    this._log(memoryId, l.learningId, l.goalId, "createMemory(rejected)", start, true);
    return { success: true, rejected };
  }

  private _log(memoryId: string, learningId: string, goalId: string, operation: string, start: number, success: boolean, error?: string): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(this._durations.reduce((a, b) => a + b, 0) / this._durations.length);
    this._logs.push(Object.freeze({ memoryId, learningId, goalId, operation, status: success ? "SUCCESS" : "FAILED", timestamp: Date.now(), duration, error }));
  }

  private _fail(memoryId: string, learningId: string, goalId: string, operation: string, start: number, error: string): { success: boolean; error: string } {
    this._log(memoryId, learningId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}