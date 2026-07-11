// Decision Engine v1.0
// Foundation v1.0 · Engineering First
// Responsabilidade UNICA: selecionar a melhor decisao dentre candidatos.
// Nao executa Goals. Nao cria planos. Nao conversa com LLM. Nao modifica Goal.

import type { GoalRegistryService } from "@/lib/goal-registry-service/GoalRegistryService";
import type { GoalScheduler } from "@/lib/goal-scheduler/GoalScheduler";
import type { GoalExecutionQueue } from "@/lib/goal-execution-queue/GoalExecutionQueue";
import type { GoalPriority } from "@/lib/goal-runtime-v01/GoalTypes";
import {
  DEFAULT_WEIGHTS,
  PRIORITY_SCORE,
  type DecisionCandidate,
  type DecisionHealth,
  type DecisionLog,
  type DecisionMetrics,
  type DecisionResult,
  type DecisionStatistics,
  type ScoreWeights,
} from "./DecisionEngineTypes";

function uid(): string {
  return `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_PRIORITIES: GoalPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export class DecisionEngine {
  private _results  = new Map<string, DecisionResult>();
  private _logs:      DecisionLog[] = [];
  private _durations: number[]      = [];
  private _scores:    number[]      = [];
  private _confidences: number[]    = [];
  private _metrics: DecisionMetrics = {
    evaluationTotal: 0, selectionTotal: 0,
    comparisonTotal: 0, rankingTotal: 0, avgDurationMs: 0,
  };

  constructor(
    private readonly weights: ScoreWeights = DEFAULT_WEIGHTS,
    private readonly registryService?: GoalRegistryService,
    private readonly scheduler?: GoalScheduler,
    private readonly queue?: GoalExecutionQueue,
  ) {}

  // ── Core scoring ──────────────────────────────────────────────────────────

  computeScore(candidate: DecisionCandidate): number {
    const pScore = PRIORITY_SCORE[candidate.priority] ?? 0.5;
    return (
      this.weights.priority   * pScore           +
      this.weights.confidence * candidate.confidence +
      this.weights.score      * candidate.score
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  evaluate(candidates: DecisionCandidate[]): { success: boolean; results?: DecisionResult[]; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return this._fail(execId, "none", "none", "evaluate", start, "candidates list is empty");
      }
      const validation = this._validateCandidates(candidates);
      if (!validation.ok) {
        return this._fail(execId, "none", "none", "evaluate", start, validation.error!);
      }

      const results: DecisionResult[] = [];
      // Group by goalId
      const byGoal = new Map<string, DecisionCandidate[]>();
      for (const c of candidates) {
        if (!byGoal.has(c.goalId)) byGoal.set(c.goalId, []);
        byGoal.get(c.goalId)!.push(c);
      }

      for (const [goalId, group] of byGoal.entries()) {
        const ranked = this._rank(group);
        const best   = ranked[0];
        const result = Object.freeze<DecisionResult>({
          decisionId:          uid(),
          goalId,
          selectedCandidateId: best.candidateId,
          score:               this.computeScore(best),
          confidence:          best.confidence,
          decisionReason:      best.reason,
          timestamp:           Date.now(),
        });
        this._results.set(result.decisionId, result);
        this._scores.push(result.score);
        this._confidences.push(result.confidence);
        results.push(result);
      }

      this._metrics.evaluationTotal++;
      this._log(execId, "batch", "batch", "evaluate", start, true);
      return { success: true, results };
    } catch (err) {
      return this._fail(execId, "none", "none", "evaluate", start, String(err));
    }
  }

  selectBest(candidates: DecisionCandidate[]): { success: boolean; best?: DecisionCandidate; result?: DecisionResult; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return this._fail(execId, "none", "none", "selectBest", start, "candidates list is empty");
      }
      const validation = this._validateCandidates(candidates);
      if (!validation.ok) {
        return this._fail(execId, "none", "none", "selectBest", start, validation.error!);
      }

      const ranked = this._rank(candidates);
      const best   = ranked[0];
      const result = Object.freeze<DecisionResult>({
        decisionId:          uid(),
        goalId:              best.goalId,
        selectedCandidateId: best.candidateId,
        score:               this.computeScore(best),
        confidence:          best.confidence,
        decisionReason:      best.reason,
        timestamp:           Date.now(),
      });
      this._results.set(result.decisionId, result);
      this._scores.push(result.score);
      this._confidences.push(result.confidence);
      this._metrics.selectionTotal++;
      this._log(execId, result.decisionId, best.goalId, "selectBest", start, true);
      return { success: true, best, result };
    } catch (err) {
      return this._fail(execId, "none", "none", "selectBest", start, String(err));
    }
  }

  rank(candidates: DecisionCandidate[]): { success: boolean; ranked?: DecisionCandidate[]; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return this._fail(execId, "none", "none", "rank", start, "candidates list is empty");
      }
      const validation = this._validateCandidates(candidates);
      if (!validation.ok) {
        return this._fail(execId, "none", "none", "rank", start, validation.error!);
      }
      const ranked = this._rank(candidates);
      this._metrics.rankingTotal++;
      this._log(execId, "rank", candidates[0]?.goalId ?? "none", "rank", start, true);
      return { success: true, ranked };
    } catch (err) {
      return this._fail(execId, "none", "none", "rank", start, String(err));
    }
  }

  compare(a: DecisionCandidate, b: DecisionCandidate): { success: boolean; winner?: DecisionCandidate; delta?: number; error?: string } {
    const start  = Date.now();
    const execId = uid();
    try {
      if (!a || !b) {
        return this._fail(execId, "none", "none", "compare", start, "Both candidates are required");
      }
      const va = this._validateCandidates([a]);
      const vb = this._validateCandidates([b]);
      if (!va.ok) return this._fail(execId, "none", "none", "compare", start, `Candidate A: ${va.error}`);
      if (!vb.ok) return this._fail(execId, "none", "none", "compare", start, `Candidate B: ${vb.error}`);

      const scoreA = this.computeScore(a);
      const scoreB = this.computeScore(b);
      const delta  = Math.round((scoreA - scoreB) * 1000) / 1000;
      const winner = this._tieBreak(a, b) <= 0 ? a : b;
      this._metrics.comparisonTotal++;
      this._log(execId, "cmp", a.goalId, "compare", start, true);
      return { success: true, winner, delta };
    } catch (err) {
      return this._fail(execId, "none", "none", "compare", start, String(err));
    }
  }

  exists(decisionId: string): boolean {
    return this._results.has(decisionId);
  }

  list(): DecisionResult[] {
    return [...this._results.values()];
  }

  statistics(): DecisionStatistics {
    const scores = this._scores;
    const confs  = this._confidences;
    const avg    = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return Object.freeze({
      totalEvaluated:    this._metrics.evaluationTotal + this._metrics.selectionTotal,
      totalSelected:     this._metrics.selectionTotal,
      averageScore:      Math.round(avg(scores) * 1000) / 1000,
      averageConfidence: Math.round(avg(confs)  * 1000) / 1000,
      highestScore:      scores.length ? Math.max(...scores) : 0,
      lowestScore:       scores.length ? Math.min(...scores) : 0,
      decisionRate:      this._metrics.selectionTotal + this._metrics.evaluationTotal,
    });
  }

  health(): DecisionHealth {
    try {
      const all = [...this._results.values()];

      const candidateIntegrity = all.every(r =>
        r.decisionId && r.goalId && r.selectedCandidateId && r.timestamp > 0,
      );

      const scoreIntegrity = all.every(r => r.score >= 0 && r.score <= 1.01);

      const rankingIntegrity = this._scores.every(s => s >= 0 && s <= 1.01);

      const consistencyCheck =
        this._metrics.selectionTotal + this._metrics.evaluationTotal >= 0 &&
        this._metrics.avgDurationMs >= 0;

      const ok = candidateIntegrity && scoreIntegrity && rankingIntegrity && consistencyCheck;
      return {
        status: ok ? "SUCCESS" : "FAILED",
        checks: { candidateIntegrity, scoreIntegrity, rankingIntegrity, consistencyCheck },
        details: `decisions=${all.length} evaluated=${this._metrics.evaluationTotal} selected=${this._metrics.selectionTotal} avgScore=${Math.round(this.statistics().averageScore * 100)}%`,
      };
    } catch (err) {
      return {
        status: "FAILED",
        checks: { candidateIntegrity: false, scoreIntegrity: false, rankingIntegrity: false, consistencyCheck: false },
        details: String(err),
      };
    }
  }

  getMetrics(): DecisionMetrics {
    return Object.freeze({ ...this._metrics });
  }

  getLogs(): DecisionLog[] {
    return [...this._logs];
  }

  clear(): void {
    this._results.clear();
    this._logs        = [];
    this._durations   = [];
    this._scores      = [];
    this._confidences = [];
    this._metrics = {
      evaluationTotal: 0, selectionTotal: 0,
      comparisonTotal: 0, rankingTotal: 0, avgDurationMs: 0,
    };
    const execId = uid();
    this._logs.push(Object.freeze({
      executionId: execId, decisionId: "none", goalId: "none",
      operation: "clear", status: "SUCCESS",
      timestamp: Date.now(), duration: 0,
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _rank(candidates: DecisionCandidate[]): DecisionCandidate[] {
    return [...candidates].sort((a, b) => this._tieBreak(a, b));
  }

  private _tieBreak(a: DecisionCandidate, b: DecisionCandidate): number {
    const sa = this.computeScore(a);
    const sb = this.computeScore(b);
    // 1. composite score DESC
    if (Math.abs(sa - sb) > 0.0001) return sb - sa;
    // 2. priority DESC
    const pa = PRIORITY_SCORE[a.priority] ?? 0;
    const pb = PRIORITY_SCORE[b.priority] ?? 0;
    if (pa !== pb) return pb - pa;
    // 3. confidence DESC
    if (Math.abs(a.confidence - b.confidence) > 0.0001) return b.confidence - a.confidence;
    // 4. createdAt ASC (earlier = preferred)
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    // 5. candidateId lexicographic
    return a.candidateId.localeCompare(b.candidateId);
  }

  private _validateCandidates(candidates: DecisionCandidate[]): { ok: boolean; error?: string } {
    for (const c of candidates) {
      if (!c.candidateId) return { ok: false, error: "candidateId is required" };
      if (!c.goalId)      return { ok: false, error: "goalId is required" };
      if (typeof c.score !== "number" || c.score < 0 || c.score > 1) {
        return { ok: false, error: `Invalid score ${c.score} for ${c.candidateId} — must be 0..1` };
      }
      if (typeof c.confidence !== "number" || c.confidence < 0 || c.confidence > 1) {
        return { ok: false, error: `Invalid confidence ${c.confidence} for ${c.candidateId} — must be 0..1` };
      }
      if (!VALID_PRIORITIES.includes(c.priority)) {
        return { ok: false, error: `Invalid priority "${c.priority}" for ${c.candidateId}` };
      }
    }
    return { ok: true };
  }

  private _log(
    executionId: string, decisionId: string, goalId: string,
    operation: string, start: number, success: boolean, error?: string,
  ): void {
    const duration = Date.now() - start;
    this._durations.push(duration);
    this._metrics.avgDurationMs = Math.round(
      this._durations.reduce((a, b) => a + b, 0) / this._durations.length,
    );
    this._logs.push(Object.freeze({
      executionId, decisionId, goalId, operation,
      status: success ? "SUCCESS" : "FAILED",
      timestamp: Date.now(), duration, error,
    }));
  }

  private _fail(
    execId: string, decisionId: string, goalId: string,
    operation: string, start: number, error: string,
  ): { success: boolean; error: string } {
    this._log(execId, decisionId, goalId, operation, start, false, error);
    return { success: false, error };
  }
}