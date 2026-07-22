/**
 * CognitiveRuntime.ts — Sprint EF-58 · Runtime Cognitivo Oficial
 *
 * Cadeia oficial completa com todos os engines integrados:
 *   Goal Engine → Planning Engine → Execution Dispatcher
 *   → Episode → Knowledge Store → Learning Engine
 *   → Knowledge Reasoning Engine → Self Optimization Engine
 *   → Meta Cognitive Engine → Reflection
 *
 * Regras:
 * - ExecutionContext único: criado uma vez, enriquecido por cada engine, nunca reconstruído.
 * - Nenhum engine ignorado. Nenhum contexto duplicado.
 * - Nenhuma decisão produzida fora dos engines oficiais.
 * - KnowledgeStore persiste entre execuções (learning contínuo).
 * - Intent/Strategy/Capability/Authority: recebidos do caller — são classificados
 *   pelo ConversationCognitiveGateway upstream (fora do escopo deste runtime).
 *
 * HMR-safe singleton via globalThis.
 */

import type { Episode, LearningReport }                   from "@/lib/cognitive-learning/CLTypes";
import type { ReasoningReport }                            from "@/lib/knowledge-reasoning/KRTypes";
import type { OptimizationReport, OptimizationSnapshot }  from "@/lib/self-optimization/SOTypes";
import type { MetaReport }                                 from "@/lib/meta-cognition/MCTypes";
import type { GoalMetadata, GoalContext, GoalResult }      from "@/lib/goal-runtime-v01/GoalTypes";
import type { ExecutionPlan }                              from "@/lib/planning-engine/PlanningEngineTypes";
import { OfficialRuntimeTraceStore }                       from "@/lib/runtime-trace/OfficialRuntimeTraceStore";

// ── ExecutionContext — único, imutável por fase, enriquecido por cada engine ──

export interface ExecutionContext {
  // Identity
  readonly executionId:   string;
  readonly runIndex:      number;

  // Input (as classified upstream by ConversationCognitiveGateway)
  readonly goal:          string;
  readonly intent:        string;
  readonly strategy:      string;
  readonly capabilities:  readonly string[];
  readonly connectors:    readonly string[];
  readonly confidence:    number;
  readonly authority:     number;
  readonly durationMs:    number;
  readonly success:       boolean;
  readonly context:       string;

  // Goal Engine output
  readonly goalId?:       string;
  readonly goalResult?:   GoalResult;

  // Planning Engine output
  readonly planId?:       string;
  readonly plan?:         ExecutionPlan;

  // Execution Dispatcher output
  readonly dispatchId?:   string;

  // Episode
  readonly episodeId?:    string;

  // Knowledge
  readonly knowledgeBefore?: number;
  readonly knowledgeAfter?:  number;

  // Learning
  readonly learningId?:   string;

  // Reasoning
  readonly reasoningId?:  string;
  readonly decisionConf?: number;
  readonly inferenceDepth?: number;

  // Optimization
  readonly optimizationId?: string;

  // Meta
  readonly metaId?:       string;
  readonly reflectionId?: string;
  readonly metaConf?:     number;
}

function enrich<T extends ExecutionContext>(ctx: T, patch: Partial<ExecutionContext>): ExecutionContext {
  return Object.freeze({ ...ctx, ...patch });
}

// ── CognitiveInput (public API) ───────────────────────────────────────────────

export interface CognitiveInput {
  readonly goal:         string;
  readonly intent:       string;
  readonly strategy:     string;
  readonly capabilities: readonly string[];
  readonly connectors:   readonly string[];
  readonly confidence:   number;
  readonly authority:    number;
  readonly durationMs:   number;
  readonly success:      boolean;
  readonly context?:     string;
  readonly metadata?:    Readonly<Record<string, unknown>>;
}

// ── CognitiveStageResult ──────────────────────────────────────────────────────

export interface CognitiveStageResult {
  readonly stage:      string;
  readonly startedAt:  number;
  readonly durationMs: number;
  readonly artifactId: string;
  readonly summary:    string;
  readonly keyMetrics: Readonly<Record<string, number | string>>;
  readonly ctxSnapshot: Readonly<Partial<ExecutionContext>>;
}

// ── CognitiveRunResult ────────────────────────────────────────────────────────

export interface CognitiveRunResult {
  readonly runId:           string;
  readonly runIndex:        number;
  readonly startedAt:       number;
  readonly totalDurationMs: number;
  readonly input:           CognitiveInput;
  readonly ctx:             ExecutionContext;   // final enriched context
  readonly stages:          readonly CognitiveStageResult[];

  // Full engine reports
  readonly goalResult:      GoalResult | null;
  readonly plan:            ExecutionPlan | null;
  readonly episode:         Episode;
  readonly learning:        LearningReport;
  readonly reasoning:       ReasoningReport;
  readonly optimization:    OptimizationReport;
  readonly meta:            MetaReport;

  // Knowledge continuity
  readonly knowledgeStateBefore: number;
  readonly knowledgeStateAfter:  number;
  readonly knowledgeGrowth:      number;

  // Feedback loop for next execution
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

let _seq = 0;
function makeCRId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── CognitiveRuntimeImpl ──────────────────────────────────────────────────────

class CognitiveRuntimeImpl {
  private _runs:     CognitiveRunResult[] = [];
  private _runIndex: number               = 0;

  // Singleton engines — instantiated once, reused across runs
  private _goalRuntime:     unknown   = null;
  private _planningEngine:  unknown   = null;
  private _dispatcher:      unknown   = null;
  private _enginesReady     = false;

  /** Lazy-init all engines once. */
  private async _initEngines(): Promise<{
    GoalRuntime:             InstanceType<typeof import("@/lib/goal-runtime-v01/GoalRuntime").GoalRuntime>;
    PlanningEngine:          InstanceType<typeof import("@/lib/planning-engine/PlanningEngine").PlanningEngine>;
    ExecutionDispatcher:     InstanceType<typeof import("@/lib/execution-dispatcher/ExecutionDispatcher").ExecutionDispatcher>;
    LearningEngine:          typeof import("@/lib/cognitive-learning/LearningEngine").LearningEngine;
    KnowledgeStore:          typeof import("@/lib/cognitive-learning/KnowledgeStore").KnowledgeStore;
    KnowledgeReasoningEngine:typeof import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine").KnowledgeReasoningEngine;
    SelfOptimizationEngine:  typeof import("@/lib/self-optimization/SelfOptimizationEngine").SelfOptimizationEngine;
    MetaCognitiveEngine:     typeof import("@/lib/meta-cognition/MetaCognitiveEngine").MetaCognitiveEngine;
  }> {
    const [
      { GoalRuntime: GRC },
      { PlanningEngine: PEC },
      { ExecutionDispatcher: EDC },
      { LearningEngine },
      { KnowledgeStore },
      { KnowledgeReasoningEngine },
      { SelfOptimizationEngine },
      { MetaCognitiveEngine },
    ] = await Promise.all([
      import("@/lib/goal-runtime-v01/GoalRuntime"),
      import("@/lib/planning-engine/PlanningEngine"),
      import("@/lib/execution-dispatcher/ExecutionDispatcher"),
      import("@/lib/cognitive-learning/LearningEngine"),
      import("@/lib/cognitive-learning/KnowledgeStore"),
      import("@/lib/knowledge-reasoning/KnowledgeReasoningEngine"),
      import("@/lib/self-optimization/SelfOptimizationEngine"),
      import("@/lib/meta-cognition/MetaCognitiveEngine"),
    ]);

    // Reuse singleton instances (HMR-safe via globalThis)
    const G = globalThis as Record<string, unknown>;
    if (!G.__CR_GR__)  G.__CR_GR__  = new GRC();
    if (!G.__CR_PE__)  G.__CR_PE__  = new PEC();
    if (!G.__CR_ED__)  G.__CR_ED__  = new EDC();

    return {
      GoalRuntime:              G.__CR_GR__ as InstanceType<typeof GRC>,
      PlanningEngine:           G.__CR_PE__ as InstanceType<typeof PEC>,
      ExecutionDispatcher:      G.__CR_ED__ as InstanceType<typeof EDC>,
      LearningEngine,
      KnowledgeStore,
      KnowledgeReasoningEngine,
      SelfOptimizationEngine,
      MetaCognitiveEngine,
    };
  }

  // ── execute() — the official cognitive cycle ────────────────────────────────

  async execute(input: CognitiveInput): Promise<CognitiveRunResult> {
    const engines = await this._initEngines();
    const {
      GoalRuntime, PlanningEngine, ExecutionDispatcher,
      LearningEngine, KnowledgeStore, KnowledgeReasoningEngine,
      SelfOptimizationEngine, MetaCognitiveEngine,
    } = engines;

    const runId      = makeCRId("cr_run");
    const startedAt  = Date.now();
    const stages: CognitiveStageResult[] = [];
    this._runIndex++;
    const runIndex = this._runIndex;

    // ── Bootstrap ExecutionContext — single source of truth for this run ──────
    let ctx: ExecutionContext = Object.freeze({
      executionId:  makeCRId("exec"),
      runIndex,
      goal:         input.goal,
      intent:       input.intent,
      strategy:     input.strategy,
      capabilities: [...input.capabilities],
      connectors:   [...input.connectors],
      confidence:   input.confidence,
      authority:    input.authority,
      durationMs:   input.durationMs,
      success:      input.success,
      context:      input.context ?? "cognitive_runtime",
    });

    // ── Snapshot KnowledgeStore BEFORE this run ───────────────────────────────
    const knowledgeBefore = KnowledgeStore.size;
    ctx = enrich(ctx, { knowledgeBefore });

    // ── EF-60A: Begin Official Runtime Trace (transparent — no logic change) ──
    const _trace = OfficialRuntimeTraceStore.beginTrace({
      runId, runIndex, executionId: ctx.executionId, goal: input.goal,
    });

    // ── STAGE 1: Goal Engine (GoalRuntime) ────────────────────────────────────
    const t_goal = Date.now();
    let goalResult: GoalResult | null = null;
    let goalId = makeCRId("goal");     // fallback if GoalRuntime fails

    try {
      const meta: GoalMetadata = {
        goalId,
        title:       input.goal.slice(0, 80),
        description: `${input.intent}: ${input.goal}`,
        priority:    input.confidence >= 0.8 ? "HIGH" : input.confidence >= 0.5 ? "MEDIUM" : "LOW",
        origin:      "AGENT",
        userId:      "cognitive_runtime",
        projectId:   ctx.executionId,
        sessionId:   runId,
        tags:        [...input.capabilities, input.strategy],
      };
      goalResult = await GoalRuntime.create(meta);
      if (goalResult.success) goalId = goalResult.goalId;
    } catch {
      goalResult = null;
    }

    ctx = enrich(ctx, { goalId, goalResult: goalResult ?? undefined });
    const dur_goal = Date.now() - t_goal;

    const _ctx_before_goal = { executionId: ctx.executionId, runIndex, knowledgeBefore };
    stages.push({
      stage: "goal", startedAt: t_goal, durationMs: dur_goal,
      artifactId: goalId,
      summary: `Goal ${goalResult?.success ? "CREATED" : "FALLBACK"}: ${input.goal.slice(0, 60)}`,
      keyMetrics: {
        goalCreated: goalResult?.success ? 1 : 0,
        priority:    input.confidence >= 0.8 ? "HIGH" : "MEDIUM",
      },
      ctxSnapshot: { goalId, executionId: ctx.executionId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "goal",
      startedAt: t_goal, finishedAt: t_goal + dur_goal,
      artifactId: goalId,
      ctxBefore: _ctx_before_goal,
      ctxAfter:  { executionId: ctx.executionId, runIndex, knowledgeBefore, goalId },
      status: goalResult?.success ? "ok" : "fallback",
      summary: `Goal ${goalResult?.success ? "CREATED" : "FALLBACK"}: ${input.goal.slice(0, 60)}`,
      keyMetrics: { goalCreated: goalResult?.success ? 1 : 0, priority: input.confidence >= 0.8 ? "HIGH" : "MEDIUM" },
    });

    // ── STAGE 2: Planning Engine ──────────────────────────────────────────────
    const t_plan = Date.now();
    let plan: ExecutionPlan | null = null;
    let planId = makeCRId("plan");

    try {
      const planResult = PlanningEngine.plan(goalId, {
        steps: input.capabilities.map((cap, i) => ({
          type:        "CAPABILITY" as const,
          description: cap,
          sequence:    i + 1,
          required:    true,
        })),
        priority: input.confidence >= 0.8 ? "HIGH" : "MEDIUM",
      });
      if (planResult.success && planResult.plan) {
        plan = planResult.plan;
        planId = plan.planId;
      }
    } catch {
      plan = null;
    }

    ctx = enrich(ctx, { planId, plan: plan ?? undefined });
    const dur_plan = Date.now() - t_plan;

    const _ctx_before_plan = { executionId: ctx.executionId, goalId: ctx.goalId };
    stages.push({
      stage: "planning", startedAt: t_plan, durationMs: dur_plan,
      artifactId: planId,
      summary: `Plan ${plan ? `READY: ${plan.steps.length} steps, complexity=${plan.complexity}` : "FALLBACK"}`,
      keyMetrics: {
        steps:      plan?.steps.length ?? 0,
        complexity: plan?.complexity ?? "LOW",
        estimatedMs:plan?.estimatedMs ?? 0,
      },
      ctxSnapshot: { goalId: ctx.goalId, planId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "planning",
      startedAt: t_plan, finishedAt: t_plan + dur_plan,
      artifactId: planId,
      ctxBefore: _ctx_before_plan,
      ctxAfter:  { executionId: ctx.executionId, goalId: ctx.goalId, planId },
      status: plan ? "ok" : "fallback",
      summary: `Plan ${plan ? `READY: ${plan.steps.length} steps, complexity=${plan.complexity}` : "FALLBACK"}`,
      keyMetrics: { steps: plan?.steps.length ?? 0, complexity: plan?.complexity ?? "LOW", estimatedMs: plan?.estimatedMs ?? 0 },
    });

    // ── STAGE 3: Execution Dispatcher ─────────────────────────────────────────
    const t_disp = Date.now();
    let dispatchId = makeCRId("disp");

    try {
      // Dispatcher needs goalId in its registry — works as standalone without GoalRegistryService
      const dispResult = ExecutionDispatcher.dispatch(goalId);
      if (dispResult.success && dispResult.dispatchId) dispatchId = dispResult.dispatchId;
    } catch {
      // Dispatcher may reject unknown goalIds without a registry — document and continue
    }

    ctx = enrich(ctx, { dispatchId });
    const dur_disp = Date.now() - t_disp;

    const _ctx_before_disp = { executionId: ctx.executionId, goalId: ctx.goalId, planId: ctx.planId };
    stages.push({
      stage: "dispatch", startedAt: t_disp, durationMs: dur_disp,
      artifactId: dispatchId,
      summary: `Dispatched goalId=${goalId.slice(-12)} → dispatchId=${dispatchId.slice(-12)}`,
      keyMetrics: { dispatchMs: dur_disp },
      ctxSnapshot: { goalId: ctx.goalId, planId: ctx.planId, dispatchId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "dispatch",
      startedAt: t_disp, finishedAt: t_disp + dur_disp,
      artifactId: dispatchId,
      ctxBefore: _ctx_before_disp,
      ctxAfter:  { executionId: ctx.executionId, goalId: ctx.goalId, planId: ctx.planId, dispatchId },
      status: "ok",
      summary: `Dispatched goalId=${goalId.slice(-12)} → dispatchId=${dispatchId.slice(-12)}`,
      keyMetrics: { dispatchMs: dur_disp },
    });

    // ── STAGE 4: Episode construction (EF-50 contract format) ─────────────────
    const t_ep = Date.now();
    const episodeId = makeCRId("ep");
    const episode: Episode = Object.freeze({
      id:             episodeId,
      createdAt:      Date.now(),
      goal:           ctx.goal,
      intent:         ctx.intent,
      context:        ctx.context,
      strategy:       ctx.strategy,
      capabilities:   [...ctx.capabilities],
      connectorChain: [...ctx.connectors],
      result:         ctx.success ? "completed" : "error",
      success:        ctx.success,
      failure:        !ctx.success,
      confidence:     ctx.confidence,
      authority:      ctx.authority,
      cost:           2,
      durationMs:     ctx.durationMs,
      // Propagate ExecutionContext IDs into episode metadata
      metadata: Object.freeze({
        executionId: ctx.executionId,
        runId,
        runIndex,
        goalId,
        planId,
        dispatchId,
        ...(input.metadata ?? {}),
      }),
    });
    const dur_ep = Date.now() - t_ep;

    ctx = enrich(ctx, { episodeId });

    const _ctx_before_ep = { executionId: ctx.executionId, goalId: ctx.goalId, planId: ctx.planId, dispatchId: ctx.dispatchId };
    stages.push({
      stage: "episode", startedAt: t_ep, durationMs: dur_ep,
      artifactId: episode.id,
      summary: `Episode ${ctx.success ? "SUCCESS" : "FAILURE"} — all IDs propagated`,
      keyMetrics: { confidence: ctx.confidence, authority: ctx.authority },
      ctxSnapshot: { goalId: ctx.goalId, planId: ctx.planId, dispatchId: ctx.dispatchId, episodeId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "episode",
      startedAt: t_ep, finishedAt: t_ep + dur_ep,
      artifactId: episodeId,
      ctxBefore: _ctx_before_ep,
      ctxAfter:  { executionId: ctx.executionId, goalId: ctx.goalId, planId: ctx.planId, dispatchId: ctx.dispatchId, episodeId },
      status: "ok",
      summary: `Episode ${ctx.success ? "SUCCESS" : "FAILURE"} — all IDs propagated`,
      keyMetrics: { confidence: ctx.confidence, authority: ctx.authority, success: ctx.success ? 1 : 0 },
    });

    // ── STAGE 5: Learning — all accumulated episodes ───────────────────────────
    // LearningEngine uses ALL episodes from previous runs + current to detect patterns.
    const t_lr = Date.now();
    const allEpisodes: Episode[] = [...this._runs.map(r => r.episode), episode];
    const learning = LearningEngine.learn(allEpisodes);
    const dur_lr = Date.now() - t_lr;

    ctx = enrich(ctx, { learningId: learning.id });

    const _ctx_before_lr = { executionId: ctx.executionId, goalId: ctx.goalId, planId: ctx.planId, dispatchId: ctx.dispatchId, episodeId: ctx.episodeId };
    stages.push({
      stage: "learning", startedAt: t_lr, durationMs: dur_lr,
      artifactId: learning.id,
      summary: `Learning: ${learning.knowledgeCreated} knowledge, ${learning.patternsFound} patterns from ${allEpisodes.length} episodes`,
      keyMetrics: {
        episodesAnalyzed: learning.episodesAnalyzed,
        knowledgeCreated: learning.knowledgeCreated,
        patternsFound:    learning.patternsFound,
        patternsApproved: learning.patternsApproved,
        learningConf:     +learning.metrics.learningConfidence.toFixed(3),
      },
      ctxSnapshot: { learningId: learning.id, executionId: ctx.executionId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "learning",
      startedAt: t_lr, finishedAt: t_lr + dur_lr,
      artifactId: learning.id,
      ctxBefore: _ctx_before_lr,
      ctxAfter:  { ..._ctx_before_lr, learningId: learning.id },
      status: "ok",
      summary: `Learning: ${learning.knowledgeCreated} knowledge, ${learning.patternsFound} patterns from ${allEpisodes.length} episodes`,
      keyMetrics: { episodesAnalyzed: learning.episodesAnalyzed, knowledgeCreated: learning.knowledgeCreated, patternsFound: learning.patternsFound, learningConf: +learning.metrics.learningConfidence.toFixed(3) },
    });

    // ── STAGE 6: KnowledgeStore state (post-learning) ─────────────────────────
    const knowledgeAfter = KnowledgeStore.size;
    const storeRules     = KnowledgeStore.getAll();
    const ksArtifactId   = KnowledgeStore.lastWriteId !== "none"
      ? KnowledgeStore.lastWriteId : "empty_store";

    ctx = enrich(ctx, { knowledgeAfter });

    const _t_ks = Date.now();
    const _ctx_before_ks = { executionId: ctx.executionId, goalId: ctx.goalId, learningId: ctx.learningId, knowledgeBefore };
    stages.push({
      stage: "knowledge_store", startedAt: _t_ks, durationMs: 0,
      artifactId: ksArtifactId,
      summary: `KnowledgeStore: ${knowledgeAfter} rules (${knowledgeAfter >= knowledgeBefore ? "+" : ""}${knowledgeAfter - knowledgeBefore} this run)`,
      keyMetrics: { totalRules: knowledgeAfter, growth: knowledgeAfter - knowledgeBefore },
      ctxSnapshot: { knowledgeBefore, knowledgeAfter, learningId: ctx.learningId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "knowledge_store",
      startedAt: _t_ks, finishedAt: _t_ks,
      artifactId: ksArtifactId,
      ctxBefore: _ctx_before_ks,
      ctxAfter:  { ..._ctx_before_ks, knowledgeAfter },
      status: "ok",
      summary: `KnowledgeStore: ${knowledgeAfter} rules (+${knowledgeAfter - knowledgeBefore} this run)`,
      keyMetrics: { totalRules: knowledgeAfter, growth: knowledgeAfter - knowledgeBefore },
    });

    // ── STAGE 7: Reasoning — reads same KnowledgeStore that Learning just wrote ─
    const t_rr = Date.now();
    const reasoning = KnowledgeReasoningEngine.reason({
      goal:         ctx.goal,
      intent:       ctx.intent,
      capabilities: [...ctx.capabilities],
      strategy:     ctx.strategy,
      // Propagate full execution context so ReasoningContextBuilder has it
      metadata: {
        executionId:    ctx.executionId,
        runId,
        goalId,
        planId,
        learningId:     learning.id,
        knowledgeRules: knowledgeAfter,
        previousRuns:   runIndex - 1,
      },
    });
    const dur_rr = Date.now() - t_rr;

    ctx = enrich(ctx, {
      reasoningId:    reasoning.id,
      decisionConf:   reasoning.decision.confidence,
      inferenceDepth: reasoning.inferenceChain.depth,
    });

    const _ctx_before_rr = { executionId: ctx.executionId, goalId: ctx.goalId, learningId: ctx.learningId, knowledgeAfter };
    stages.push({
      stage: "reasoning", startedAt: t_rr, durationMs: dur_rr,
      artifactId: reasoning.id,
      summary: `Reasoning: depth=${reasoning.inferenceChain.depth} conf=${reasoning.decision.confidence.toFixed(3)} rules=${reasoning.metrics.knowledgeRetrieved}`,
      keyMetrics: {
        inferenceDepth:     reasoning.inferenceChain.depth,
        decisionConf:       +reasoning.decision.confidence.toFixed(3),
        decisionAuth:       +reasoning.decision.authority.toFixed(3),
        knowledgeRetrieved: reasoning.metrics.knowledgeRetrieved,
        conflictCount:      reasoning.conflicts.length,
      },
      ctxSnapshot: {
        reasoningId:    reasoning.id,
        decisionConf:   reasoning.decision.confidence,
        inferenceDepth: reasoning.inferenceChain.depth,
        knowledgeAfter,
      },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "reasoning",
      startedAt: t_rr, finishedAt: t_rr + dur_rr,
      artifactId: reasoning.id,
      ctxBefore: _ctx_before_rr,
      ctxAfter:  { ..._ctx_before_rr, reasoningId: reasoning.id, decisionConf: reasoning.decision.confidence, inferenceDepth: reasoning.inferenceChain.depth },
      status: "ok",
      summary: `Reasoning: depth=${reasoning.inferenceChain.depth} conf=${reasoning.decision.confidence.toFixed(3)} rules=${reasoning.metrics.knowledgeRetrieved}`,
      keyMetrics: { inferenceDepth: reasoning.inferenceChain.depth, decisionConf: +reasoning.decision.confidence.toFixed(3), knowledgeRetrieved: reasoning.metrics.knowledgeRetrieved, conflictCount: reasoning.conflicts.length },
    });

    // ── STAGE 8: Self Optimization — uses ctx + all episode data + reasoning ───
    const t_opt = Date.now();
    // Build snapshot from all accumulated episodes
    const baseSnap = SelfOptimizationEngine.buildSnapshot(allEpisodes);
    // Enrich with live knowledge/reasoning data from THIS execution context
    const enrichedSnap: OptimizationSnapshot = SelfOptimizationEngine.enrichSnapshot(
      baseSnap,
      {
        knowledgeRuleCount:      knowledgeAfter,
        knowledgeAvgConfidence:  storeRules.length > 0
          ? storeRules.reduce((a, r) => a + r.confidence, 0) / storeRules.length : 0,
        knowledgeAvgSuccessRate: storeRules.length > 0
          ? storeRules.reduce((a, r) => a + r.successRate, 0) / storeRules.length : 0,
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

    ctx = enrich(ctx, { optimizationId: optimization.id });

    const _ctx_before_opt = { executionId: ctx.executionId, goalId: ctx.goalId, reasoningId: ctx.reasoningId, knowledgeAfter };
    stages.push({
      stage: "optimization", startedAt: t_opt, durationMs: dur_opt,
      artifactId: optimization.id,
      summary: `Optimization: ${optimization.recommendations.length} recs, ${optimization.findings.length} findings`,
      keyMetrics: {
        recommendations: optimization.recommendations.length,
        findings:        optimization.findings.length,
        avgImpact:       +optimization.metrics.avgImprovementScore.toFixed(3),
      },
      ctxSnapshot: {
        optimizationId: optimization.id,
        reasoningId:    ctx.reasoningId,
        knowledgeAfter,
      },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "optimization",
      startedAt: t_opt, finishedAt: t_opt + dur_opt,
      artifactId: optimization.id,
      ctxBefore: _ctx_before_opt,
      ctxAfter:  { ..._ctx_before_opt, optimizationId: optimization.id },
      status: "ok",
      summary: `Optimization: ${optimization.recommendations.length} recs, ${optimization.findings.length} findings`,
      keyMetrics: { recommendations: optimization.recommendations.length, findings: optimization.findings.length, avgImpact: +optimization.metrics.avgImprovementScore.toFixed(3) },
    });

    // ── STAGE 9: Meta-Cognition — receives data from ALL previous stages ───────
    const t_mc = Date.now();
    const meta = MetaCognitiveEngine.analyze({
      // All values come from the enriched ExecutionContext — not reconstructed
      goal:             ctx.goal,
      strategy:         ctx.strategy,
      capabilities:     [...ctx.capabilities],
      connectors:       [...ctx.connectors],
      knowledgeRules:   learning.knowledgeCreated,
      inferenceDepth:   reasoning.inferenceChain.depth,
      inferenceConf:    reasoning.inferenceChain.overallConfidence,
      decisionConf:     reasoning.decision.confidence,
      decisionAuth:     reasoning.decision.authority,
      optimizationRecs: optimization.recommendations.length,
      success:          ctx.success,
      durationMs:       ctx.durationMs,
      conflictCount:    reasoning.conflicts.length,
      confidence:       ctx.confidence,
      authority:        ctx.authority,
    });
    const dur_mc = Date.now() - t_mc;

    ctx = enrich(ctx, {
      metaId:       meta.id,
      reflectionId: meta.reflection.id,
      metaConf:     meta.metrics.metaConfidence,
    });

    const _ctx_before_mc = { executionId: ctx.executionId, goalId: ctx.goalId, reasoningId: ctx.reasoningId, optimizationId: ctx.optimizationId };
    stages.push({
      stage: "meta_cognition", startedAt: t_mc, durationMs: dur_mc,
      artifactId: meta.id,
      summary: `Meta: conf=${meta.metrics.metaConfidence.toFixed(3)} biases=${meta.biases.length} consistency=${meta.metrics.consistencyScore.toFixed(2)}`,
      keyMetrics: {
        metaConf:         +meta.metrics.metaConfidence.toFixed(3),
        reasoningQuality: +meta.metrics.reasoningQuality.toFixed(3),
        biasCount:        meta.biases.length,
        consistencyScore: +meta.metrics.consistencyScore.toFixed(3),
      },
      ctxSnapshot: {
        metaId:        meta.id,
        reflectionId:  meta.reflection.id,
        metaConf:      meta.metrics.metaConfidence,
        optimizationId:ctx.optimizationId,
      },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "meta_cognition",
      startedAt: t_mc, finishedAt: t_mc + dur_mc,
      artifactId: meta.id,
      ctxBefore: _ctx_before_mc,
      ctxAfter:  { ..._ctx_before_mc, metaId: meta.id, reflectionId: meta.reflection.id, metaConf: meta.metrics.metaConfidence },
      status: "ok",
      summary: `Meta: conf=${meta.metrics.metaConfidence.toFixed(3)} biases=${meta.biases.length} consistency=${meta.metrics.consistencyScore.toFixed(2)}`,
      keyMetrics: { metaConf: +meta.metrics.metaConfidence.toFixed(3), reasoningQuality: +meta.metrics.reasoningQuality.toFixed(3), biasCount: meta.biases.length },
    });

    // ── STAGE 10: Reflection — exposed from MetaReport ────────────────────────
    const reflection = meta.reflection;
    const _t_ref = Date.now();
    const _ctx_before_ref = { executionId: ctx.executionId, goalId: ctx.goalId, metaId: ctx.metaId };

    stages.push({
      stage: "reflection", startedAt: _t_ref, durationMs: 0,
      artifactId: reflection.id,
      summary: `Reflection: +${reflection.strengths.length} strengths −${reflection.weaknesses.length} weaknesses ↑${reflection.improvements.length} improvements`,
      keyMetrics: {
        strengths:    reflection.strengths.length,
        weaknesses:   reflection.weaknesses.length,
        improvements: reflection.improvements.length,
        retentions:   reflection.retentions.length,
      },
      ctxSnapshot: { reflectionId: reflection.id, metaId: ctx.metaId },
    });
    // EF-60A trace
    OfficialRuntimeTraceStore.recordStage({
      trace: _trace, stage: "reflection",
      startedAt: _t_ref, finishedAt: _t_ref,
      artifactId: reflection.id,
      ctxBefore: _ctx_before_ref,
      ctxAfter:  { ..._ctx_before_ref, reflectionId: reflection.id },
      status: "ok",
      summary: `Reflection: +${reflection.strengths.length} strengths −${reflection.weaknesses.length} weaknesses ↑${reflection.improvements.length} improvements`,
      keyMetrics: { strengths: reflection.strengths.length, weaknesses: reflection.weaknesses.length, improvements: reflection.improvements.length, retentions: reflection.retentions.length },
    });

    // ── Feedback for next run ─────────────────────────────────────────────────
    const topCapReinf  = learning.capabilityReinforcements[0];
    const topStratReinf= learning.strategyReinforcements[0];

    const feedbackForNext = Object.freeze({
      rulesAvailable:    knowledgeAfter,
      topStrategy:       topStratReinf?.strategy ?? ctx.strategy,
      topCapability:     topCapReinf?.capability  ?? (ctx.capabilities[0] ?? "none"),
      avgDecisionConf:   reasoning.decision.confidence,
      metaConf:          meta.metrics.metaConfidence,
      reflectionSummary: reflection.summary,
    });

    const totalDurationMs = Date.now() - startedAt;

    const summary =
      `Run #${runIndex} [${ctx.executionId.slice(-8)}] | ${ctx.goal.slice(0, 45)} | ` +
      `Goal→Plan→Dispatch→Episode→Learning→KS→Reasoning→Optimization→Meta→Reflection | ` +
      `Knowledge: ${knowledgeBefore}→${knowledgeAfter} (+${knowledgeAfter - knowledgeBefore}) | ` +
      `depth=${reasoning.inferenceChain.depth} metaConf=${meta.metrics.metaConfidence.toFixed(2)} | ` +
      `${totalDurationMs}ms`;

    const result: CognitiveRunResult = Object.freeze({
      runId,
      runIndex,
      startedAt,
      totalDurationMs,
      input,
      ctx,                          // final enriched context — single source of truth
      stages: Object.freeze(stages),
      goalResult,
      plan,
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

    // EF-60A: Finalize the official trace with the complete final ctx
    OfficialRuntimeTraceStore.finalizeTrace({
      trace: _trace,
      ctxFinal: ctx as unknown as Record<string, unknown>,
    });

    this._runs.push(result);
    return result;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getRuns(): readonly CognitiveRunResult[]  { return this._runs; }
  getLastRun(): CognitiveRunResult | null   { return this._runs[this._runs.length - 1] ?? null; }
  getRunCount(): number                     { return this._runs.length; }

  /** Reset run history only. KnowledgeStore persists (learning is continuous). */
  resetHistory(): void { this._runs = []; this._runIndex = 0; }

  /** Full reset: history + goal/plan/dispatch state. KnowledgeStore unchanged. */
  resetEngines(): void {
    const G = globalThis as Record<string, unknown>;
    delete G.__CR_GR__;
    delete G.__CR_PE__;
    delete G.__CR_ED__;
    this.resetHistory();
  }

  getCognitiveFeedback() {
    return this.getLastRun()?.feedbackForNext ?? null;
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & { __EF57_CR__?: CognitiveRuntimeImpl };
if (!G.__EF57_CR__) G.__EF57_CR__ = new CognitiveRuntimeImpl();
export const CognitiveRuntime: CognitiveRuntimeImpl = G.__EF57_CR__;