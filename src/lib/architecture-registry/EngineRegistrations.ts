/**
 * EngineRegistrations — Sprint EF-60
 *
 * Auto-registro de todos os engines oficiais no ArchitectureRegistry.
 * Importar este modulo uma vez no bootstrap e todos os engines estao registrados.
 * NENHUMA lista e declarada aqui — cada engine descreve apenas a si mesmo.
 */

import { ArchitectureRegistry } from "./ArchitectureRegistry";

// ── Engine 0: GoalRuntime ─────────────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "goal_runtime",
  name: "GoalRuntime",
  version: "0.1",
  owner: "goal-runtime-v01",
  responsibility: "Aceita, valida e registra o Goal. Produz GoalId e GoalResult como artefatos canônicos de entrada da pipeline.",
  pipelineStage: 0,
  contract: {
    input:     "GoalMetadata { goal, intent, strategy, capabilities, connectors }",
    output:    "GoalResult { goalId, status, priority, complexity, estimatedDuration }",
    execution: "Synchronous / Deterministic",
    lifecycle: "create → validate → register → publish",
    ctxFields: ["goalId", "goalResult", "goalStatus"],
    ctxReads:  [],
  },
  ownership: {
    creates:  ["GoalId", "GoalResult"],
    modifies: [],
    consumes: ["GoalMetadata"],
    publishes:["GoalResult"],
    persists: ["Goal"],
  },
  dependencies: [
    { engineId: "cognitive_runtime", type: "orchestrates", legal: true },
  ],
});

// ── Engine 1: PlanningEngine ──────────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "planning_engine",
  name: "PlanningEngine",
  version: "1.0",
  owner: "planning-engine",
  responsibility: "Decompõe o Goal em ExecutionPlan com steps ordenados. Produz PlanId.",
  pipelineStage: 1,
  contract: {
    input:     "{ goalId, goalResult, steps[] }",
    output:    "ExecutionPlan { planId, steps[], complexity, priority }",
    execution: "Synchronous / Deterministic",
    lifecycle: "read_goal → decompose → create_plan → publish",
    ctxFields: ["planId", "plan"],
    ctxReads:  ["goalId", "goalResult"],
  },
  ownership: {
    creates:  ["PlanId", "ExecutionPlan"],
    modifies: [],
    consumes: ["GoalId", "GoalResult"],
    publishes:["ExecutionPlan"],
    persists: ["Plan"],
  },
  dependencies: [
    { engineId: "goal_runtime",      type: "consumes", legal: true },
    { engineId: "cognitive_runtime", type: "orchestrates", legal: true },
  ],
});

// ── Engine 2: ExecutionDispatcher ─────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "execution_dispatcher",
  name: "ExecutionDispatcher",
  version: "1.0",
  owner: "execution-dispatcher",
  responsibility: "Despacha o plano para execução. Seleciona connectors e capabilities. Produz DispatchId.",
  pipelineStage: 2,
  contract: {
    input:     "{ goalId, planId, plan }",
    output:    "DispatchResult { dispatchId, connectorUsed, capabilityUsed, status }",
    execution: "Async / Connector-bound",
    lifecycle: "read_plan → select_connector → dispatch → publish",
    ctxFields: ["dispatchId", "dispatchResult"],
    ctxReads:  ["goalId", "planId", "plan"],
  },
  ownership: {
    creates:  ["DispatchId"],
    modifies: [],
    consumes: ["GoalId", "PlanId", "ExecutionPlan"],
    publishes:["DispatchResult"],
    persists: [],
  },
  dependencies: [
    { engineId: "planning_engine",   type: "consumes",    legal: true },
    { engineId: "goal_runtime",      type: "consumes",    legal: true },
    { engineId: "cognitive_runtime", type: "orchestrates",legal: true },
  ],
});

// ── Engine 3: EpisodeEngine ───────────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "episode_engine",
  name: "EpisodeEngine",
  version: "1.0",
  owner: "cognitive-runtime(internal)",
  responsibility: "Registra o episódio de execução com todos os artefatos produzidos. Produz EpisodeId.",
  pipelineStage: 3,
  contract: {
    input:     "ExecutionContext (full: goalId, planId, dispatchId, ...)",
    output:    "Episode { episodeId, goalId, planId, dispatchId, timestamp, outcome }",
    execution: "Synchronous",
    lifecycle: "collect_ctx → create_episode → persist → publish",
    ctxFields: ["episodeId"],
    ctxReads:  ["goalId", "planId", "dispatchId"],
  },
  ownership: {
    creates:  ["EpisodeId", "Episode"],
    modifies: [],
    consumes: ["ExecutionContext"],
    publishes:["Episode"],
    persists: ["Episode"],
  },
  dependencies: [
    { engineId: "execution_dispatcher", type: "consumes",    legal: true },
    { engineId: "cognitive_runtime",    type: "orchestrates",legal: true },
  ],
});

// ── Engine 4: LearningEngine ──────────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "learning_engine",
  name: "LearningEngine",
  version: "1.0",
  owner: "cognitive-learning",
  responsibility: "Analisa episódios anteriores e produz regras de aprendizado. Alimenta o KnowledgeStore.",
  pipelineStage: 4,
  contract: {
    input:     "allEpisodes[] (histórico completo do EpisodeEngine)",
    output:    "LearningReport { learningId, rules[], episodesAnalyzed, patterns[] }",
    execution: "Async / Pattern-mining",
    lifecycle: "load_episodes → mine_patterns → extract_rules → publish",
    ctxFields: ["learningId", "learningReport"],
    ctxReads:  ["episodeId"],
  },
  ownership: {
    creates:  ["LearningId", "LearningReport", "KnowledgeRules"],
    modifies: [],
    consumes: ["Episodes[]"],
    publishes:["LearningReport"],
    persists: [],
  },
  dependencies: [
    { engineId: "episode_engine",    type: "consumes",    legal: true },
    { engineId: "cognitive_runtime", type: "orchestrates",legal: true },
  ],
});

// ── Engine 5: KnowledgeStore ──────────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "knowledge_store",
  name: "KnowledgeStore",
  version: "1.0",
  owner: "cognitive-learning",
  responsibility: "Persiste e recupera regras de conhecimento. Unico responsável pela escrita no KS.",
  pipelineStage: 5,
  contract: {
    input:     "KnowledgeRules[] (do LearningEngine)",
    output:    "{ knowledgeBefore, knowledgeAfter, knowledgeGrowth }",
    execution: "Synchronous / Persistent",
    lifecycle: "receive_rules → validate → persist → index → expose",
    ctxFields: ["knowledgeBefore", "knowledgeAfter"],
    ctxReads:  ["learningId", "learningReport"],
  },
  ownership: {
    creates:  [],
    modifies: ["KnowledgeRules"],
    consumes: ["KnowledgeRules"],
    publishes:[],
    persists: ["KnowledgeRules"],
  },
  dependencies: [
    { engineId: "learning_engine",   type: "persists",    legal: true },
    { engineId: "cognitive_runtime", type: "orchestrates",legal: true },
  ],
});

// ── Engine 6: KnowledgeReasoningEngine ────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "reasoning_engine",
  name: "KnowledgeReasoningEngine",
  version: "1.0",
  owner: "knowledge-reasoning",
  responsibility: "Raciocina sobre o goal usando o KS atualizado. Produz ReasoningReport e Decision.",
  pipelineStage: 6,
  contract: {
    input:     "{ goal, executionContext, knowledgeAfter (from KS) }",
    output:    "ReasoningReport { reasoningId, decision, inferenceChain, confidence }",
    execution: "Async / Knowledge-driven",
    lifecycle: "load_knowledge → build_graph → infer → decide → publish",
    ctxFields: ["reasoningId", "decisionConf", "inferenceDepth"],
    ctxReads:  ["goalId", "knowledgeAfter"],
  },
  ownership: {
    creates:  ["ReasoningId", "ReasoningReport", "Decision"],
    modifies: [],
    consumes: ["Goal", "ExecutionContext", "KnowledgeRules"],
    publishes:["ReasoningReport"],
    persists: [],
  },
  dependencies: [
    { engineId: "knowledge_store",   type: "reads",       legal: true },
    { engineId: "cognitive_runtime", type: "orchestrates",legal: true },
  ],
});

// ── Engine 7: SelfOptimizationEngine ─────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "optimization_engine",
  name: "SelfOptimizationEngine",
  version: "1.0",
  owner: "self-optimization",
  responsibility: "Analisa o snapshot de execução e o reasoning para gerar recomendações de otimização.",
  pipelineStage: 7,
  contract: {
    input:     "{ executionSnapshot, reasoningReport }",
    output:    "OptimizationReport { optimizationId, recommendations[], score, policies[] }",
    execution: "Async / Policy-driven",
    lifecycle: "analyze_snapshot → apply_policies → generate_recommendations → publish",
    ctxFields: ["optimizationId"],
    ctxReads:  ["reasoningId", "inferenceDepth", "decisionConf"],
  },
  ownership: {
    creates:  ["OptimizationId", "OptimizationReport"],
    modifies: [],
    consumes: ["ExecutionSnapshot", "ReasoningReport"],
    publishes:["OptimizationReport"],
    persists: [],
  },
  dependencies: [
    { engineId: "reasoning_engine",  type: "consumes",    legal: true },
    { engineId: "cognitive_runtime", type: "orchestrates",legal: true },
  ],
});

// ── Engine 8: MetaCognitiveEngine ─────────────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "meta_cognition_engine",
  name: "MetaCognitiveEngine",
  version: "1.0",
  owner: "meta-cognition",
  responsibility: "Avalia a execução completa e internamente aciona o ReflectionEngine. Produz MetaReport.",
  pipelineStage: 8,
  contract: {
    input:     "{ fullExecutionContext, optimizationReport, reasoningReport }",
    output:    "MetaReport { metaId, reflectionId, metaConfidence, reflection.improvements[] }",
    execution: "Async / Self-evaluating",
    lifecycle: "evaluate_execution → run_reflection → assess_quality → publish",
    ctxFields: ["metaId", "reflectionId", "metaConf"],
    ctxReads:  ["optimizationId", "reasoningId"],
  },
  ownership: {
    creates:  ["MetaId", "MetaReport", "Reflection"],
    modifies: [],
    consumes: ["ExecutionContext (full)", "OptimizationReport", "ReasoningReport"],
    publishes:["MetaReport"],
    persists: [],
  },
  dependencies: [
    { engineId: "optimization_engine", type: "consumes",    legal: true },
    { engineId: "reasoning_engine",    type: "consumes",    legal: true },
    { engineId: "cognitive_runtime",   type: "orchestrates",legal: true },
  ],
});

// ── Engine 9: ReflectionEngine (inner) ───────────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "reflection_engine",
  name: "ReflectionEngine",
  version: "1.0",
  owner: "meta-cognition",
  responsibility: "Produz reflexão estruturada sobre a execução. Chamado internamente pelo MetaCognitiveEngine.",
  pipelineStage: 9,
  contract: {
    input:     "MetaReport (do MetaCognitiveEngine)",
    output:    "Reflection { improvements[], summary, nextSteps[] }",
    execution: "Synchronous / Inner",
    lifecycle: "read_meta → generate_reflection → register_improvements → return",
    ctxFields: [],          // reflectionId já é escrito pelo MetaCognitiveEngine
    ctxReads:  ["metaId"],
  },
  ownership: {
    creates:  ["Reflection"],
    modifies: [],
    consumes: ["MetaReport"],
    publishes:[],
    persists: [],
  },
  dependencies: [
    { engineId: "meta_cognition_engine", type: "inner", legal: true },
  ],
});

// ── Engine -1: CognitiveRuntime (orchestrator) ────────────────────────────────
ArchitectureRegistry.registerEngine({
  id: "cognitive_runtime",
  name: "CognitiveRuntime",
  version: "1.0",
  owner: "cognitive-runtime",
  responsibility: "Orquestrador exclusivo da Pipeline Oficial. NÃO contém lógica cognitiva. Propaga ExecutionContext.",
  pipelineStage: -1,        // not a pipeline stage — orchestrator
  contract: {
    input:     "RunInput { goal, intent, strategy, capabilities, connectors, ... }",
    output:    "CognitiveRunResult { runId, stages[], ctx, knowledgeStateAfter, ... }",
    execution: "Async / Sequential orchestration",
    lifecycle: "create_ctx → run_pipeline → collect_stages → publish",
    ctxFields: ["executionId", "runIndex"],
    ctxReads:  [],
  },
  ownership: {
    creates:  ["ExecutionContext", "RunResult"],
    modifies: ["ExecutionContext (enrich)"],
    consumes: ["All engine outputs"],
    publishes:["CognitiveRunResult"],
    persists: ["RunHistory"],
  },
  dependencies: [],   // orchestrator has no upstream dependency — it IS the root
});