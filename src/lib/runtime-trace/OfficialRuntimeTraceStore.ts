/**
 * OfficialRuntimeTraceStore.ts — EF-60A
 *
 * Runtime Trace Oficial da Pipeline Cognitiva do MemoryOS.
 *
 * Registra, em ordem cronologica, cada evento de cada stage de cada execucao.
 * Transparente: nao altera fluxo, pipeline, contratos, responsabilidades ou resultado.
 * Somente registra.
 *
 * HMR-safe singleton via globalThis.
 */

// ── Tipos do Trace ────────────────────────────────────────────────────────────

export interface StageTraceEvent {
  // Identidade
  readonly traceId:       string;   // ID unico deste evento
  readonly executionId:   string;   // ID do ExecutionContext desta execucao
  readonly runId:         string;   // ID do run (cr_run_...)
  readonly runIndex:      number;   // sequencia global

  // Stage
  readonly position:      number;   // 1-10 (posicao na pipeline oficial)
  readonly stage:         string;   // nome do stage
  readonly engine:        string;   // engine responsavel

  // Timestamps
  readonly startedAt:     number;   // Date.now() ao iniciar
  readonly finishedAt:    number;   // Date.now() ao terminar
  readonly durationMs:    number;   // finishedAt - startedAt

  // ExecutionContext
  readonly ctxBefore:     Record<string, unknown>;  // ctx ANTES do stage
  readonly ctxAfter:      Record<string, unknown>;  // ctx DEPOIS do stage (campos adicionados)
  readonly ctxDelta:      Record<string, unknown>;  // apenas os campos novos/alterados

  // Artefatos
  readonly artifactId:    string;   // artefato produzido
  readonly artifactOwner: string;   // engine proprietario
  readonly artifactsConsumed: string[];  // artefatos usados como entrada
  readonly artifactsProduced: string[];  // artefatos gerados

  // Contratos e dependencias
  readonly contractIn:    string;   // descricao do contrato de entrada
  readonly contractOut:   string;   // descricao do contrato de saida
  readonly dependsOn:     string[]; // engines/stages dos quais depende
  readonly nextStage:     string;   // proximo stage chamado

  // Resultado
  readonly status:        "ok" | "fallback" | "skipped";
  readonly summary:       string;
  readonly keyMetrics:    Record<string, number | string>;
}

export interface RuntimeTrace {
  readonly traceSessionId: string;
  readonly startedAt:      number;
  readonly finishedAt:     number | null;
  readonly totalDurationMs: number | null;
  readonly runId:          string;
  readonly runIndex:       number;
  readonly executionId:    string;
  readonly goal:           string;
  readonly events:         StageTraceEvent[];
  readonly ctxFinal:       Record<string, unknown>;
  readonly complete:       boolean;
}

// ── Mapa de metadados oficiais por stage ──────────────────────────────────────

const STAGE_META: Record<string, {
  engine: string; position: number; owner: string;
  contractIn: string; contractOut: string;
  dependsOn: string[]; nextStage: string;
  consumed: string[]; produced: string[];
}> = {
  goal: {
    engine: "GoalRuntime", position: 1, owner: "GoalRuntime",
    contractIn:  "GoalMetadata{goalId,title,description,priority,origin,userId,projectId,sessionId,tags}",
    contractOut: "GoalResult{goalId,success} → ctx.goalId",
    dependsOn:   [],
    nextStage:   "planning",
    consumed:    ["CognitiveInput.goal","CognitiveInput.intent","CognitiveInput.capabilities"],
    produced:    ["goalId","GoalResult"],
  },
  planning: {
    engine: "PlanningEngine", position: 2, owner: "PlanningEngine",
    contractIn:  "goalId + steps(capabilities) + priority",
    contractOut: "ExecutionPlan{planId,steps,complexity,estimatedMs} → ctx.planId",
    dependsOn:   ["GoalRuntime"],
    nextStage:   "dispatch",
    consumed:    ["ctx.goalId","CognitiveInput.capabilities","CognitiveInput.confidence"],
    produced:    ["planId","ExecutionPlan"],
  },
  dispatch: {
    engine: "ExecutionDispatcher", position: 3, owner: "ExecutionDispatcher",
    contractIn:  "goalId",
    contractOut: "dispatchId → ctx.dispatchId",
    dependsOn:   ["GoalRuntime"],
    nextStage:   "episode",
    consumed:    ["ctx.goalId"],
    produced:    ["dispatchId"],
  },
  episode: {
    engine: "EpisodeEngine", position: 4, owner: "EpisodeEngine",
    contractIn:  "ctx(goal,intent,strategy,capabilities,connectors,success,confidence,authority,durationMs,goalId,planId,dispatchId)",
    contractOut: "Episode{id,goal,intent,strategy,capabilities,connectorChain,result,success,metadata} → ctx.episodeId",
    dependsOn:   ["GoalRuntime","PlanningEngine","ExecutionDispatcher"],
    nextStage:   "learning",
    consumed:    ["ctx.goal","ctx.intent","ctx.strategy","ctx.capabilities","ctx.goalId","ctx.planId","ctx.dispatchId"],
    produced:    ["episodeId","Episode"],
  },
  learning: {
    engine: "LearningEngine", position: 5, owner: "LearningEngine",
    contractIn:  "allEpisodes[] (historico + episode atual)",
    contractOut: "LearningReport{id,episodesAnalyzed,knowledgeCreated,patternsFound,patternsApproved,metrics} → ctx.learningId",
    dependsOn:   ["EpisodeEngine"],
    nextStage:   "knowledge_store",
    consumed:    ["Episode[]","ctx.episodeId"],
    produced:    ["learningId","LearningReport","KnowledgeRules"],
  },
  knowledge_store: {
    engine: "KnowledgeStore", position: 6, owner: "KnowledgeStore",
    contractIn:  "KnowledgeRules persisted by LearningEngine",
    contractOut: "knowledgeAfter (size checkpoint) → ctx.knowledgeAfter",
    dependsOn:   ["LearningEngine"],
    nextStage:   "reasoning",
    consumed:    ["LearningReport.knowledgeCreated"],
    produced:    ["knowledgeAfter","persisted_rules"],
  },
  reasoning: {
    engine: "KnowledgeReasoningEngine", position: 7, owner: "KnowledgeReasoningEngine",
    contractIn:  "goal+intent+capabilities+strategy + metadata(executionId,goalId,planId,learningId,knowledgeRules,previousRuns)",
    contractOut: "ReasoningReport{id,inferenceChain,decision,conflicts,metrics} → ctx.reasoningId",
    dependsOn:   ["KnowledgeStore"],
    nextStage:   "optimization",
    consumed:    ["ctx.goal","ctx.intent","ctx.capabilities","ctx.strategy","ctx.knowledgeAfter","ctx.learningId"],
    produced:    ["reasoningId","ReasoningReport","Decision"],
  },
  optimization: {
    engine: "SelfOptimizationEngine", position: 8, owner: "SelfOptimizationEngine",
    contractIn:  "OptimizationSnapshot(episodes+knowledge+reasoning) via buildSnapshot+enrichSnapshot",
    contractOut: "OptimizationReport{id,recommendations,findings,metrics} → ctx.optimizationId",
    dependsOn:   ["KnowledgeReasoningEngine","EpisodeEngine"],
    nextStage:   "meta_cognition",
    consumed:    ["Episode[]","ctx.reasoningId","ctx.knowledgeAfter"],
    produced:    ["optimizationId","OptimizationReport"],
  },
  meta_cognition: {
    engine: "MetaCognitiveEngine", position: 9, owner: "MetaCognitiveEngine",
    contractIn:  "goal+strategy+capabilities+connectors+knowledgeRules+inferenceDepth+inferenceConf+decisionConf+decisionAuth+optimizationRecs+success+durationMs+conflictCount+confidence+authority",
    contractOut: "MetaReport{id,metrics,biases,reflection} → ctx.metaId + ctx.reflectionId",
    dependsOn:   ["KnowledgeReasoningEngine","SelfOptimizationEngine"],
    nextStage:   "reflection",
    consumed:    ["ctx.goal","ctx.strategy","ctx.capabilities","ctx.reasoningId","ctx.optimizationId"],
    produced:    ["metaId","MetaReport"],
  },
  reflection: {
    engine: "ReflectionEngine", position: 10, owner: "ReflectionEngine",
    contractIn:  "MetaReport.reflection (inner — producido pelo MetaCognitiveEngine)",
    contractOut: "Reflection{id,strengths,weaknesses,improvements,retentions,summary} → ctx.reflectionId",
    dependsOn:   ["MetaCognitiveEngine"],
    nextStage:   "PIPELINE_COMPLETE",
    consumed:    ["ctx.metaId","MetaReport.reflection"],
    produced:    ["reflectionId","Reflection"],
  },
};

// ── ID factory ────────────────────────────────────────────────────────────────

let _traceSeq = 0;
function makeTraceId(): string {
  return `trace_${Date.now()}_${(++_traceSeq).toString(36)}`;
}

// ── OfficialRuntimeTraceStore ─────────────────────────────────────────────────

class OfficialRuntimeTraceStoreImpl {
  private _traces:    RuntimeTrace[] = [];
  private _listeners: Array<() => void> = [];

  subscribe(fn: () => void): () => void {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  }

  private _notify(): void {
    this._listeners.forEach(fn => { try { fn(); } catch { /* silent */ } });
  }

  // ── Called by CognitiveRuntime at the start of each run ──────────────────

  beginTrace(params: {
    runId: string; runIndex: number; executionId: string; goal: string;
  }): RuntimeTrace {
    const trace: RuntimeTrace = {
      traceSessionId: makeTraceId(),
      startedAt:      Date.now(),
      finishedAt:     null,
      totalDurationMs:null,
      runId:          params.runId,
      runIndex:       params.runIndex,
      executionId:    params.executionId,
      goal:           params.goal,
      events:         [],
      ctxFinal:       {},
      complete:       false,
    };
    this._traces.push(trace);
    this._notify();
    return trace;
  }

  // ── Called by CognitiveRuntime after each stage completes ────────────────

  recordStage(params: {
    trace:       RuntimeTrace;
    stage:       string;
    startedAt:   number;
    finishedAt:  number;
    artifactId:  string;
    ctxBefore:   Record<string, unknown>;
    ctxAfter:    Record<string, unknown>;
    status:      "ok" | "fallback" | "skipped";
    summary:     string;
    keyMetrics:  Record<string, number | string>;
  }): void {
    const meta = STAGE_META[params.stage];
    if (!meta) return;

    const ctxDelta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params.ctxAfter)) {
      if (params.ctxBefore[k] === undefined) ctxDelta[k] = v;
    }

    const event: StageTraceEvent = {
      traceId:           makeTraceId(),
      executionId:       params.ctxAfter["executionId"] as string ?? "",
      runId:             params.trace.runId,
      runIndex:          params.trace.runIndex,
      position:          meta.position,
      stage:             params.stage,
      engine:            meta.engine,
      startedAt:         params.startedAt,
      finishedAt:        params.finishedAt,
      durationMs:        params.finishedAt - params.startedAt,
      ctxBefore:         { ...params.ctxBefore },
      ctxAfter:          { ...params.ctxAfter },
      ctxDelta,
      artifactId:        params.artifactId,
      artifactOwner:     meta.owner,
      artifactsConsumed: [...meta.consumed],
      artifactsProduced: [...meta.produced],
      contractIn:        meta.contractIn,
      contractOut:       meta.contractOut,
      dependsOn:         [...meta.dependsOn],
      nextStage:         meta.nextStage,
      status:            params.status,
      summary:           params.summary,
      keyMetrics:        { ...params.keyMetrics },
    };

    // Mutate trace.events (trace object is kept as reference in _traces)
    (params.trace as unknown as { events: StageTraceEvent[] }).events.push(event);
    this._notify();
  }

  // ── Called by CognitiveRuntime when the run completes ────────────────────

  finalizeTrace(params: {
    trace:    RuntimeTrace;
    ctxFinal: Record<string, unknown>;
  }): void {
    const t = params.trace as unknown as {
      finishedAt: number; totalDurationMs: number;
      ctxFinal: Record<string, unknown>; complete: boolean;
    };
    t.finishedAt     = Date.now();
    t.totalDurationMs = t.finishedAt - params.trace.startedAt;
    t.ctxFinal       = { ...params.ctxFinal };
    t.complete       = true;
    this._notify();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getAll(): RuntimeTrace[] { return [...this._traces]; }
  getLast(): RuntimeTrace | null { return this._traces[this._traces.length - 1] ?? null; }
  clear(): void { this._traces = []; this._notify(); }

  // ── Export ─────────────────────────────────────────────────────────────────

  export(): string {
    return JSON.stringify(this._traces, null, 2);
  }
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

const _G = globalThis as typeof globalThis & { __EF60A_TRACE_STORE__?: OfficialRuntimeTraceStoreImpl };
if (!_G.__EF60A_TRACE_STORE__) _G.__EF60A_TRACE_STORE__ = new OfficialRuntimeTraceStoreImpl();
export const OfficialRuntimeTraceStore: OfficialRuntimeTraceStoreImpl = _G.__EF60A_TRACE_STORE__;

// Export meta for consumers
export { STAGE_META };