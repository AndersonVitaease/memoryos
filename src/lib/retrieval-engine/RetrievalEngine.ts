// Retrieval Engine v1.0
// Foundation v1.0 · Engineering First · Sprint EF-13
// Single Responsibility: query Memory and return ranked RetrievalHits.
// NOT modifying Memory. NOT creating new Knowledge/Learning. NOT using LLM. NOT persisting state.

import type { Memory } from "@/lib/memory-engine-v1/MemoryEngineTypes";
import type { MemoryEngine } from "@/lib/memory-engine-v1/MemoryEngine";
import {
  IMPORTANCE_RANK,
  RETRIEVAL_DEFAULT_LIMIT,
  RETRIEVAL_MAX_LIMIT,
  RETRIEVAL_MIN_SCORE,
  type RetrievalHealth,
  type RetrievalHit,
  type RetrievalLog,
  type RetrievalMetrics,
  type RetrievalQuery,
  type RetrievalResult,
  type RetrievalStatistics,
  type RetrievalStatus,
  type RetrievalStrategy,
  type RetrievalType,
  type SortOrder,
} from "./RetrievalEngineTypes";

function uid(): string {
  return `ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function quid(): string {
  return `qry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALL_TYPES: RetrievalType[] = ["LESSON","BEST_PRACTICE","WARNING","RULE","PATTERN","ANTI_PATTERN","OBSERVATION"];

export class RetrievalEngine {
  private _results  = new Map<string, RetrievalResult>();
  private _logs:      RetrievalLog[] = [];
  private _durations: number[]       = [];
  private _scores:    number[]       = [];
  private _hitsPerQ:  number[]       = [];
  private _metrics: RetrievalMetrics = {
    queryTotal: 0, hitTotal: 0, missTotal: 0, partialTotal: 0,
    avgDurationMs: 0, avgHitsPerQuery: 0,
  };

  constructor(private readonly memoryEngine?: MemoryEngine) {}

  // ── Public API ───────────────────────────────────────────────────────────────

  query(params: Omit<RetrievalQuery, "queryId" | "createdAt">): {
    success: boolean;
    result?: RetrievalResult;
    retrievalId?: string;
    error?: string;
  } {
    const start       = Date.now();
    const execId      = uid();
    const retrievalId = uid();
    const queryId     = quid();

    try {
      const strategy: RetrievalStrategy = params.strategy ?? "COMPOSITE";
      const limit = Math.min(
        params.limit ?? RETRIEVAL_DEFAULT_LIMIT,
        RETRIEVAL_MAX_LIMIT,
      );

      // Build full query object
      const query: RetrievalQuery = Object.freeze({
        queryId,
        goalId:         params.goalId,
        keywords:       params.keywords ?? [],
        types:          params.types,
        minScore:       params.minScore ?? RETRIEVAL_MIN_SCORE,
        minImportance:  params.minImportance,
        minConfidence:  params.minConfidence,
        limit,
        sortBy:         params.sortBy ?? "SCORE_DESC",
        strategy,
        createdAt:      Date.now(),
      });

      // Fetch candidate memories
      const pool = this._getPool();

      // Filter
      const filtered = this._filter(pool, query);

      // Score relevance
      const scored = filtered.map(m => ({
        memory: m,
        relevance: this._scoreRelevance(m, query),
      }));

      // Apply minimum score filter
      const passing = scored.filter(s => s.relevance >= 0);

      // Sort
      const sorted = this._sort(passing, query.sortBy ?? "SCORE_DESC");

      // Limit
      const limited = sorted.slice(0, limit);

      // Build hits
      const hits: Readonly<RetrievalHit>[] = limited.map(({ memory, relevance }) =>
        Object.freeze<RetrievalHit>({
          memoryId:       memory.memoryId,
          goalId:         memory.goalId,
          memoryType:     memory.memoryType,
          importance:     memory.importance,
          confidence:     memory.confidence,
          memoryScore:    memory.memoryScore,
          relevanceScore: Math.round(relevance * 1000) / 1000,
          title:          memory.title,
          summary:        memory.summary,
          insights:       Object.freeze([...memory.evidence.insights]),
          patterns:       Object.freeze([...memory.evidence.patterns]),
          recommendations: Object.freeze([...memory.evidence.recommendations]),
          matchedKeywords: Object.freeze(this._matchedKeywords(memory, query.keywords ?? [])),
          retrievedAt:    Date.now(),
        }),
      );

      const totalFound    = passing.length;
      const totalReturned = hits.length;
      const status: RetrievalStatus =
        totalFound === 0   ? "MISS"
        : totalReturned < totalFound ? "PARTIAL"
        : "HIT";

      const result = Object.freeze<RetrievalResult>({
        retrievalId,
        queryId,
        status,
        hits:          Object.freeze(hits),
        totalFound,
        totalReturned,
        strategy,
        durationMs:    Date.now() - start,
        createdAt:     Date.now(),
      });

      this._results.set(retrievalId, result);
      this._trackQuery(status, hits.map(h => h.relevanceScore));
      this._log(execId, retrievalId, queryId, "query", start, true, hits.length);
      return { success: true, result, retrievalId };
    } catch (err) {
      return this._fail(execId, retrievalId, queryId, "query", start, String(err));
    }
  }

  queryByGoal(goalId: string, limit = RETRIEVAL_DEFAULT_LIMIT): ReturnType<RetrievalEngine["query"]> {
    return this.query({ goalId, limit, strategy: "EXACT" });
  }

  queryByKeywords(keywords: string[], limit = RETRIEVAL_DEFAULT_LIMIT): ReturnType<RetrievalEngine["query"]> {
    return this.query({ keywords, limit, strategy: "FUZZY" });
  }

  queryByType(type: RetrievalType, limit = RETRIEVAL_DEFAULT_LIMIT): ReturnType<RetrievalEngine["query"]> {
    return this.query({ types: [type], limit, strategy: "EXACT" });
  }

  queryTopScoring(limit = RETRIEVAL_DEFAULT_LIMIT): ReturnType<RetrievalEngine["query"]> {
    return this.query({ limit, sortBy: "SCORE_DESC", strategy: "COMPOSITE" });
  }

  getResult(retrievalId: string): RetrievalResult | null {
    return this._results.get(retrievalId) ?? null;
  }

  exists(retrievalId: string): boolean {
    return this._results.has(retrievalId);
  }

  list(): RetrievalResult[] {
    return [...this._results.values()];
  }

  statistics(): RetrievalStatistics {
    const all = [...this._results.values()];
    const avgRel = this._scores.length
      ? Math.round((this._scores.reduce((a, b) => a + b, 0) / this._scores.length) * 1000) / 1000
      : 0;
    const avgHits = this._hitsPerQ.length
      ? Math.round((this._hitsPerQ.reduce((a, b) => a + b, 0) / this._hitsPerQ.length) * 10) / 10
      : 0;

    const byStrategy: Record<RetrievalStrategy, number> = { EXACT: 0, FUZZY: 0, SEMANTIC: 0, COMPOSITE: 0 };
    const byType: Record<RetrievalType, number> = Object.fromEntries(ALL_TYPES.map(t => [t, 0])) as any;

    all.forEach(r => {
      byStrategy[r.strategy] = (byStrategy[r.strategy] ?? 0) + 1;
      r.hits.forEach(h => { byType[h.memoryType] = (byType[h.memoryType] ?? 0) + 1; });
    });

    const total = this._metrics.queryTotal;
    return Object.freeze({
      totalQueries:      total,
      totalHits:         this._metrics.hitTotal,
      totalMisses:       this._metrics.missTotal,
      totalPartial:      this._metrics.partialTotal,
      hitRate:           total > 0 ? Math.round(((total - this._metrics.missTotal) / total) * 100) / 100 : 0,
      avgRelevanceScore: avgRel,
      avgHitsPerQuery:   avgHits,
      queryByStrategy:   Object.freeze({ ...byStrategy }),
      queryByType:       Object.freeze({ ...byType }),
    });
  }

  health(): RetrievalHealth {
    try {
      const all = [...this._results.values()];

      const indexIntegrity = this.memoryEngine
        ? this.memoryEngine.list().every(m => m.memoryId && m.status === "ACTIVE")
        : true;

      const queryIntegrity = all.every(r =>
        r.retrievalId && r.queryId && r.strategy && r.createdAt > 0,
      );

      const resultIntegrity = all.every(r =>
        Array.isArray(r.hits) &&
        r.hits.every(h => h.memoryId && h.relevanceScore >= 0 && h.retrievedAt > 0),
      );

      const consistencyCheck =
        this._metrics.queryTotal ===
        this._metrics.hitTotal + this._metrics.missTotal + this._metrics.partialTotal;

      const ok = indexIntegrity && queryIntegrity && resultIntegrity && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { indexIntegrity, queryIntegrity, resultIntegrity, consistencyCheck },
        details: `results=${all.length} queries=${this._metrics.queryTotal} hits=${this._metrics.hitTotal} misses=${this._metrics.missTotal} partial=${this._metrics.partialTotal}`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { indexIntegrity: false, queryIntegrity: false, resultIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getLogs():    RetrievalLog[]    { return [...this._logs]; }
  getMetrics(): RetrievalMetrics  { return Object.freeze({ ...this._metrics }); }

  clear(): void {
    this._results.clear();
    this._logs      = [];
    this._durations = [];
    this._scores    = [];
    this._hitsPerQ  = [];
    this._metrics   = {
      queryTotal: 0, hitTotal: 0, missTotal: 0, partialTotal: 0,
      avgDurationMs: 0, avgHitsPerQuery: 0,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _getPool(): Memory[] {
    if (this.memoryEngine) {
      return this.memoryEngine.list("ACTIVE");
    }
    return [];
  }

  private _filter(pool: Memory[], query: RetrievalQuery): Memory[] {
    return pool.filter(m => {
      if (m.status !== "ACTIVE") return false;
      if (query.goalId && m.goalId !== query.goalId) return false;
      if (query.types?.length && !query.types.includes(m.memoryType)) return false;
      if (query.minScore !== undefined && m.memoryScore < query.minScore) return false;
      if (query.minImportance && IMPORTANCE_RANK[m.importance] < IMPORTANCE_RANK[query.minImportance]) return false;
      if (query.minConfidence) {
        const confRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
        if ((confRank[m.confidence] ?? 0) < (confRank[query.minConfidence] ?? 0)) return false;
      }
      return true;
    });
  }

  private _scoreRelevance(memory: Memory, query: RetrievalQuery): number {
    let score = memory.memoryScore / 100;

    // Keyword bonus
    const keywords = query.keywords ?? [];
    if (keywords.length > 0) {
      const text = [
        memory.title, memory.summary,
        ...memory.evidence.insights,
        ...memory.evidence.patterns,
        ...memory.evidence.recommendations,
      ].join(" ").toLowerCase();

      const matched = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
      const keywordBonus = (matched / keywords.length) * 0.3;
      score = Math.min(1, score + keywordBonus);
    }

    // Importance bonus
    const impBonus: Record<string, number> = { CRITICAL: 0.1, HIGH: 0.06, MEDIUM: 0.02, LOW: 0 };
    score = Math.min(1, score + (impBonus[memory.importance] ?? 0));

    // Confidence bonus
    const confBonus: Record<string, number> = { HIGH: 0.05, MEDIUM: 0.02, LOW: 0 };
    score = Math.min(1, score + (confBonus[memory.confidence] ?? 0));

    return Math.round(score * 1000) / 1000;
  }

  private _matchedKeywords(memory: Memory, keywords: string[]): string[] {
    if (!keywords.length) return [];
    const text = [
      memory.title, memory.summary,
      ...memory.evidence.insights,
      ...memory.evidence.patterns,
    ].join(" ").toLowerCase();
    return keywords.filter(kw => text.includes(kw.toLowerCase()));
  }

  private _sort(
    scored: Array<{ memory: Memory; relevance: number }>,
    order: SortOrder,
  ): Array<{ memory: Memory; relevance: number }> {
    return [...scored].sort((a, b) => {
      switch (order) {
        case "SCORE_DESC":      return b.relevance - a.relevance;
        case "SCORE_ASC":       return a.relevance - b.relevance;
        case "RECENCY_DESC":    return b.memory.createdAt - a.memory.createdAt;
        case "IMPORTANCE_DESC":
          return (IMPORTANCE_RANK[b.memory.importance] ?? 0) - (IMPORTANCE_RANK[a.memory.importance] ?? 0);
        default:                return b.relevance - a.relevance;
      }
    });
  }

  private _trackQuery(status: RetrievalStatus, scores: number[]): void {
    this._metrics.queryTotal++;
    if (status === "HIT")     this._metrics.hitTotal++;
    if (status === "MISS")    this._metrics.missTotal++;
    if (status === "PARTIAL") this._metrics.partialTotal++;
    scores.forEach(s => this._scores.push(s));
    this._hitsPerQ.push(scores.length);
    this._metrics.avgHitsPerQuery =
      Math.round((this._hitsPerQ.reduce((a, b) => a + b, 0) / this._hitsPerQ.length) * 10) / 10;
  }

  private _log(
    executionId: string, retrievalId: string, queryId: string,
    operation: string, start: number, success: boolean, hitsReturned: number, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, retrievalId, queryId, operation,
      status: success ? "SUCCESS" : "FAILED",
      hitsReturned, timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, retrievalId: string, queryId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, retrievalId, queryId, operation, start, false, 0, error);
    return { success: false, error };
  }
}