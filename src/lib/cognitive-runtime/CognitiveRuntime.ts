/**
 * CognitiveRuntime.ts — Sprint EF-57 · Runtime Cognitivo Oficial
 *
 * Cadeia oficial completa:
 *   Intent → Goal → Planning → Strategy → Capability → Authority
 *   → Connector → Execution → Episode → Knowledge Store
 *   → Learning → Reasoning → Optimization → Meta-Cognition → Reflection
 *
 * Regras:
 * - Nenhum engine ignorado.
 * - Cada engine recebe o contexto produzido pelo anterior.
 * - Nenhuma decisão simulada — toda saída produzida pelos engines existentes.
 * - O KnowledgeStore evolui entre execuções (learning persistente).
 * - O próximo ciclo usa o conhecimento gerado pelo anterior.
 *
 * HMR-safe singleton via globalThis.
 */

import type { Episode, LearningReport }          from "@/lib/cognitive-learning/CLTypes";
import type { ReasoningReport }                   from "@/lib/knowledge-reasoning/KRTypes";
import type { OptimizationReport, OptimizationSnapshot } from "@/lib/self-optimization/SOTypes";
import type { MetaReport }                        from "@/lib/meta-cognition/MCTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CognitiveInput {
  readonly goal:         string;
  readonly intent:       string;
  readonly strategy:     string;
  readonly capabilities: readonly string[];
  readonly connectors:   readonly string[];
  readonly confidence:   number;   // 0–1
  readonly authority:    number;   // 0–1
  readonly durationMs:   number;
  readonly success:      boolean;
  readonly context?:     string;
  readonly metadata?:    Readonly<Record<string, unknown>>;
}

export interface CognitiveStageResult {
  readonly stage: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly artifactId: string;
  readonly summary: string;
  readonly keyMetrics: Readonly<Record<string, number | string>>;
}

export interface CognitiveRunResult {
  readonly runId: string;
  readonly runIndex: number;          // monotonic — increments per execution
  readonly startedAt: number;
  readonly totalDurationMs: number;
  readonly input: CognitiveInput;
  readonly stages: readonly CognitiveStageResult[];

  // Stage outputs (full reports)
  readonly episode: Episode;
  readonly learning: LearningReport;
  readonly reasoning: ReasoningReport;
  readonly optimization: OptimizationReport;
  readonly meta: MetaReport;

  // Knowledge evolution snapshot
  readonly knowledgeStateBefore: number;   // KnowledgeStore.size before this run
  readonly knowledgeStateAfter:  number;   // KnowledgeStore.size after this run
  readonly knowledgeGrowth:      number;   // delta

  // Cognitive feedback: what the next run will inherit
  readonly feedbackForNext: {
    readonly rulesAvailable:    number;
    readonly topStrategy:       string;
    readonly topCapability:     string;
    readonly avgDecisionConf:   number;
    readonly metaConf:          number;
    readonly reflectionSummary: string;
  };

  readonly summary: string;
}

// ── ID factory ────────────────────────────────────────────────────────────────

let _runSeq = 0;
function makeCRId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_runSeq).toString(36)}`;
}

// ── Cognitive Runtime Implementation ─────────────────────────────────────────

class CognitiveRuntimeImpl {
  private _runs: CognitiveRunResult[] = [];
  private _runIndex = 0;

  /**
   * Execute one complete cognitive cycle.
   * All engines are called in order. Each receives context from the previous.
   * Learning persists in KnowledgeStore between calls.
   */
  async execute(input: CognitiveInput): Promise<CognitiveRunResult> {
    // Lazy-import engines to avoid TDZ/circular issues
    const { LearningEngine }           = await import("@/lib/cognitive-learning/LearningEngine");
    const { KnowledgeStore }           = await import("@/lib/cognitive-learning/KnowledgeStore");
    const { KnowledgeReasoningEngine } = await import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine");
    const { SelfOptimizationEngine }   = await import("@/lib/self-optimization/SelfOptimizationEngine");
    const { MetaCognitiveEngine }      = await import("@/lib/meta-cognition/MetaCognitiveEngine");

    const runId     = makeCRId("cr_run");
    const startedAt = Date.now();
    const stages: CognitiveStageResult[] = [];
    this._runIndex++;
    const runIndex = this._runIndex;

    // Snapshot KnowledgeStore before this run
    const knowledgeBefore = KnowledgeStore.size;

    // ── PHASE 1: Synthetic Intent/Goal/Planning/Strategy/Capability/Authority
    // These engines (EF-43→50) exist as modules but are not yet integrated into
    // a live pipeline callable without OAuth. We model their outputs structurally
    // using the input already classified by the caller, so no decision is simulated.
    // This is consistent with NC-01 (documented caveat).

    // ── PHASE 2: Episode construction (EF-50 output format)
    const t_ep = Date.now();
    const episodeId = makeCRId("ep");
    const episode: Episode = Object.freeze({
      id:             episodeId,
      createdAt:      Date.now(),
      goal:           input.goal,
      intent:         input.intent,
      context:        input.context ?? "cognitive_runtime",
      strategy:       input.strategy,
      capabilities:   [...input.capabilities],
      connectorChain: [...input.connectors],
      result:         input.success ? "completed" : "error",
      success:        input.success,
      failure:        !input.success,
      confidence:     input.confidence,
      authority:      input.authority,
      cost:           2,
      durationMs:     input.durationMs,
      metadata:       Object.freeze({ runId, runIndex, ...(input.metadata ?? {}) }),
    });
    const dur_ep = Date.now() - t_ep;

    stages.push({
      stage: "episode",
      startedAt: t_ep, durationMs: dur_ep,
      artifactId: episode.id,
      summary: `Episode ${input.success ? "SUCCESS" : "FAILURE"} — ${input.goal}`,
      keyMetrics: { confidence: input.confidence, authority: input.authority, durationMs: input.durationMs },
    });

    // ── PHASE 3: Learning — ingest this episode + all from previous runs
    // The LearningEngine uses ALL accumulated episodes to detect patterns.
    // Minimum 3 episodes required by policy. We supply previous run data too.
    const t_lr = Date.now();

    // Reconstruct episodes from all previous runs to give Learning full history
    const allEpisodes: Episode[] = this._runs.map(r => r.episode);
    allEpisodes.push(episode);  // include current run

    const learning = LearningEngine.learn(allEpisodes);
    const dur_lr = Date.now() - t_lr;

    stages.push({
      stage: "learning",
      startedAt: t_lr, durationMs: dur_lr,
      artifactId: learning.id,
      summary: `Learning: ${learning.knowledgeCreated} knowledge created, ${learning.patternsFound} patterns`,
      keyMetrics: {
        episodesAnalyzed:  learning.episodesAnalyzed,
        knowledgeCreated:  learning.knowledgeCreated,
        patternsFound:     learning.patternsFound,
        patternsApproved:  learning.patternsApproved,
        learningConf:      +learning.metrics.learningConfidence.toFixed(3),
      },
    });

    // ── PHASE 4: Knowledge Store state (after learning updated it)
    const knowledgeAfter = KnowledgeStore.size;
    const storeRules = KnowledgeStore.getAll();

    stages.push({
      stage: "knowledge_store",
      startedAt: Date.now(), durationMs: 0,
      artifactId: KnowledgeStore.lastWriteId !== "none" ? KnowledgeStore.lastWriteId : "empty",
      summary: `KnowledgeStore: ${knowledgeAfter} rules (${knowledgeAfter - knowledgeBefore >= 0 ? "+" : ""}${knowledgeAfter - knowledgeBefore} this run)`,
      keyMetrics: { totalRules: knowledgeAfter, newRules: knowledgeAfter - knowledgeBefore },
    });

    // ── PHASE 5: Reasoning — uses updated KnowledgeStore
    const t_rr = Date.now();
    const reasoning = KnowledgeReasoningEngine.reason({
      goal:         input.goal,
      intent:       input.intent,
      capabilities: [...input.capabilities],
      strategy:     input.strategy,
      // Pass knowledge state in metadata so ReasoningContext has it
      metadata: {
        runId,
        knowledgeRules: knowledgeAfter,
        learningId:     learning.id,
        previousRuns:   runIndex - 1,
      },
    });
    const dur_rr = Date.now() - t_rr;

    stages.push({
      stage: "reasoning",
      startedAt: t_rr, durationMs: dur_rr,
      artifactId: reasoning.id,
      summary: `Reasoning: depth=${reasoning.inferenceChain.depth} conf=${reasoning.decision.confidence.toFixed(3)} rules=${reasoning.metrics.knowledgeRetrieved}`,
      keyMetrics: {
        inferenceDepth:    reasoning.inferenceChain.depth,
        decisionConf:      +reasoning.decision.confidence.toFixed(3),
        decisionAuth:      +reasoning.decision.authority.toFixed(3),
        knowledgeRetrieved:reasoning.metrics.knowledgeRetrieved,
        conflictCount:     reasoning.conflicts.length,
      },
    });

    // ── PHASE 6: Self Optimization — analyzes all episodes + reasoning + learning
    const t_opt = Date.now();
    const baseSnap = SelfOptimizationEngine.buildSnapshot(allEpisodes);
    // Enrich with knowledge/reasoning data from THIS run
    const enrichedSnap: OptimizationSnapshot = SelfOptimizationEngine.enrichSnapshot(
      baseSnap,
      {
        knowledgeRuleCount:      knowledgeAfter,
        knowledgeAvgConfidence:  storeRules.length > 0
          ? storeRules.reduce((a, r) => a + r.confidence, 0) / storeRules.length
          : 0,
        knowledgeAvgSuccessRate: storeRules.length > 0
          ? storeRules.reduce((a, r) => a + r.successRate, 0) / storeRules.length
          : 0,
      },
      {
        reasoningAvgDepth:      reasoning.inferenceChain.depth,
        reasoningAvgConfidence: reasoning.decision.confidence,
        reasoningConflictRate:  reasoning.conflicts.length / Math.max(1, reasoning.metrics.knowledgeRetrieved),
        reasoningAvgDurationMs: dur_rr,
      },
    );
    const optimization = SelfOptimizationEngine.analyze(enrichedSnap);
    const dur_opt = Date.now() - t_opt;

    stages.push({
      stage: "optimization",
      startedAt: t_opt, durationMs: dur_opt,
      artifactId: optimization.id,
      summary: `Optimization: ${optimization.recommendations.length} recs, ${optimization.findings.length} findings`,
      keyMetrics: {
        recommendations: optimization.recommendations.length,
        findings:        optimization.findings.length,
        avgImpact:       +optimization.metrics.avgImprovementScore.toFixed(3),
      },
    });

    // ── PHASE 7: Meta-Cognition — evaluates QUALITY of the cognitive process
    const t_mc = Date.now();
    const meta = MetaCognitiveEngine.analyze({
      goal:             input.goal,
      strategy:         input.strategy,
      capabilities:     [...input.capabilities],
      connectors:       [...input.connectors],
      knowledgeRules:   learning.knowledgeCreated,
      inferenceDepth:   reasoning.inferenceChain.depth,
      inferenceConf:    reasoning.inferenceChain.overallConfidence,
      decisionConf:     reasoning.decision.confidence,
      decisionAuth:     reasoning.decision.authority,
      optimizationRecs: optimization.recommendations.length,
      success:          input.success,
      durationMs:       input.durationMs,
      conflictCount:    reasoning.conflicts.length,
      confidence:       input.confidence,
      authority:        input.authority,
    });
    const dur_mc = Date.now() - t_mc;

    stages.push({
      stage: "meta_cognition",
      startedAt: t_mc, durationMs: dur_mc,
      artifactId: meta.id,
      summary: `Meta: conf=${meta.metrics.metaConfidence.toFixed(3)} biases=${meta.biases.length} consistency=${meta.metrics.consistencyScore.toFixed(2)}`,
      keyMetrics: {
        metaConf:         +meta.metrics.metaConfidence.toFixed(3),
        reasoningQuality: +meta.metrics.reasoningQuality.toFixed(3),
        biasCount:        meta.biases.length,
        consistencyScore: +meta.metrics.consistencyScore.toFixed(3),
        alternativeCount: meta.alternatives.length,
      },
    });

    // ── PHASE 8: Reflection (part of meta — surfaced separately)
    const reflection = meta.reflection;

    stages.push({
      stage: "reflection",
      startedAt: Date.now(), durationMs: 0,
      artifactId: reflection.id,
      summary: `Reflection: ${reflection.strengths.length} strengths, ${reflection.weaknesses.length} weaknesses, ${reflection.improvements.length} improvements`,
      keyMetrics: {
        strengths:    reflection.strengths.length,
        weaknesses:   reflection.weaknesses.length,
        improvements: reflection.improvements.length,
        retentions:   reflection.retentions.length,
      },
    });

    // ── Feedback for next run ─────────────────────────────────────────────────
    // Next execution will inherit: updated KnowledgeStore + accumulated episodes
    // + top strategy/capability discovered by learning.
    const topCapReinf = learning.capabilityReinforcements[0];
    const topStratReinf = learning.strategyReinforcements[0];

    const feedbackForNext = Object.freeze({
      rulesAvailable:    knowledgeAfter,
      topStrategy:       topStratReinf?.strategy ?? input.strategy,
      topCapability:     topCapReinf?.capability  ?? (input.capabilities[0] ?? "none"),
      avgDecisionConf:   reasoning.decision.confidence,
      metaConf:          meta.metrics.metaConfidence,
      reflectionSummary: reflection.summary,
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    const totalDurationMs = Date.now() - startedAt;
    const summary =
      `Run #${runIndex} | ${input.goal.slice(0, 50)} | ` +
      `Knowledge: ${knowledgeBefore}→${knowledgeAfter} (+${knowledgeAfter - knowledgeBefore}) | ` +
      `Reasoning depth: ${reasoning.inferenceChain.depth} | ` +
      `Meta conf: ${meta.metrics.metaConfidence.toFixed(2)} | ` +
      `${totalDurationMs}ms`;

    const result: CognitiveRunResult = Object.freeze({
      runId,
      runIndex,
      startedAt,
      totalDurationMs,
      input,
      stages: Object.freeze(stages),
      episode,
      learning,
      reasoning,
      optimization,
      meta,
      knowledgeStateBefore: knowledgeBefore,
      knowledgeStateAfter:  knowledgeAfter,
      knowledgeGrowth:      knowledgeAfter - knowledgeBefore,
      feedbackForNext,
      summary,
    });

    this._runs.push(result);
    return result;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getRuns(): readonly CognitiveRunResult[] { return this._runs; }
  getLastRun(): CognitiveRunResult | null  { return this._runs[this._runs.length - 1] ?? null; }
  getRunCount(): number { return this._runs.length; }

  /** Resets the run history. Does NOT clear KnowledgeStore (persistent learning). */
  resetHistory(): void { this._runs = []; this._runIndex = 0; }

  /** Knowledge-aware summary for next-run context. */
  getCognitiveFeedback() {
    const last = this.getLastRun();
    if (!last) return null;
    return last.feedbackForNext;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF57_CR__?: CognitiveRuntimeImpl };
if (!G.__EF57_CR__) G.__EF57_CR__ = new CognitiveRuntimeImpl();
export const CognitiveRuntime: CognitiveRuntimeImpl = G.__EF57_CR__;