/**
 * RuntimePipelineInstrument.ts — Sprint EF-49.2
 *
 * Instrumentação arquitetural da pipeline real de produção.
 * Observa o runtime sem alterar nenhum comportamento.
 *
 * Arquitetura REAL do runtime de produção:
 *   ChatPage → useConversation → ConversationManager
 *     → ConversationPipeline
 *       → PrimaryConversationRouter (intent)
 *       → ConversationGoalBridge (goal derivation — EF-style goal, lightweight)
 *       → ConversationPlanningEngine (plan — via GoalCapabilityRegistry)
 *       → ConversationRuntimeEngine (execução)
 *         → ExecutionDispatcher → ConnectorCapabilityExecutor
 *           → UniversalConnectorRouter → GitHubConnector / GoogleDriveConnector / GmailConnector
 *       → ResponseArbiter (seleção final)
 *
 * Camadas EF-43→EF-49 (GoalEngine, CRE, CBE, SGE, SSE, CO, DPE, PlannerEngine):
 *   - Desenvolvidas e certificadas entre si
 *   - NÃO integradas ao runtime de produção ainda
 *   - Chamadas apenas pelos dashboards de demonstração (/sprint-ef43 ... /sprint-ef49)
 *   - Esta instrumentação documenta isso com honestidade
 */

export interface PipelineLayerEvent {
  executionId:  string;
  layer:        string;
  source:       "production_runtime" | "ef_demo_only";
  timestamp:    number;
  durationMs:   number | null;
  input:        string;
  output:       string;
  caller:       string;
  next:         string;
  status:       "executed" | "bypassed" | "not_integrated";
}

export interface RuntimePipelineTrace {
  executionId:  string;
  userMessage:  string;
  startedAt:    number;
  finishedAt:   number | null;
  layers:       PipelineLayerEvent[];
  source:       "production_runtime" | "ef_demo_only";
}

// ── In-memory store ────────────────────────────────────────────────────────────

const G = globalThis as typeof globalThis & {
  __EF492_TRACES__?: RuntimePipelineTrace[];
};
if (!G.__EF492_TRACES__) G.__EF492_TRACES__ = [];

export const ef492Store = {
  begin(executionId: string, userMessage: string): void {
    G.__EF492_TRACES__!.push({
      executionId,
      userMessage,
      startedAt:  Date.now(),
      finishedAt: null,
      layers:     [],
      source:     "production_runtime",
    });
    // cap to last 5
    if (G.__EF492_TRACES__!.length > 5) G.__EF492_TRACES__!.shift();
  },

  record(executionId: string, event: Omit<PipelineLayerEvent, "executionId">): void {
    const trace = G.__EF492_TRACES__!.find(t => t.executionId === executionId);
    if (trace) trace.layers.push({ executionId, ...event });
  },

  finish(executionId: string): void {
    const trace = G.__EF492_TRACES__!.find(t => t.executionId === executionId);
    if (trace) trace.finishedAt = Date.now();
  },

  getAll(): RuntimePipelineTrace[] {
    return [...(G.__EF492_TRACES__ ?? [])];
  },

  getLast(): RuntimePipelineTrace | null {
    const all = G.__EF492_TRACES__ ?? [];
    return all.length > 0 ? all[all.length - 1] : null;
  },

  clear(): void {
    G.__EF492_TRACES__ = [];
  },
};

// ── Static architectural report ────────────────────────────────────────────────
// Documents the actual call chain from code audit.

export interface ArchitecturalLayer {
  id:          string;
  label:       string;
  file:        string;
  method:      string;
  input:       string;
  output:      string;
  caller:      string;
  next:        string;
  sprint:      string;
  integrated:  "production" | "demo_only" | "not_built";
  bypassNote:  string | null;
}

export const PRODUCTION_PIPELINE: ArchitecturalLayer[] = [
  {
    id: "chat",
    label: "ChatPage",
    file: "src/pages/ChatPage.jsx",
    method: "send(text)",
    input: "User text input",
    output: "conversationManager.send(text)",
    caller: "User (browser)",
    next: "ConversationManager",
    sprint: "VXP",
    integrated: "production",
    bypassNote: null,
  },
  {
    id: "manager",
    label: "ConversationManager",
    file: "src/lib/conversation-platform/ConversationManager.ts",
    method: "send(userMessage)",
    input: "string",
    output: "conversationPipeline.send(msg)",
    caller: "ChatPage → useConversation",
    next: "ConversationPipeline",
    sprint: "VXP",
    integrated: "production",
    bypassNote: null,
  },
  {
    id: "pipeline",
    label: "ConversationPipeline",
    file: "src/lib/conversation-platform/ConversationPipeline.ts",
    method: "_runPipeline(executionId, userMessage, steps)",
    input: "userMessage + session",
    output: "finalResponse (string)",
    caller: "ConversationManager",
    next: "PrimaryConversationRouter",
    sprint: "E-02.3",
    integrated: "production",
    bypassNote: null,
  },
  {
    id: "router",
    label: "PrimaryConversationRouter",
    file: "src/lib/primary-conversation-router/PrimaryConversationRouter.ts",
    method: "route(message, sessionId, projectId, historyLen)",
    input: "userMessage",
    output: "RouterResult { decision, intent, cognitiveAnswer }",
    caller: "ConversationPipeline",
    next: "ConversationGoalBridge",
    sprint: "E-02.1",
    integrated: "production",
    bypassNote: null,
  },
  {
    id: "goal_bridge",
    label: "ConversationGoalBridge",
    file: "src/lib/conversation-goal-bridge/ConversationGoalBridge.ts",
    method: "derive(message, intent, confidence)",
    input: "userMessage + routerIntent",
    output: "GoalBridgeResult { goal: { type, valid, confidence, parameters } }",
    caller: "ConversationPipeline",
    next: "ConversationPlanningEngine",
    sprint: "E-02.1",
    integrated: "production",
    bypassNote: "Lightweight goal — NOT the full GoalEngine (EF-43). GoalEngine is demo-only.",
  },
  {
    id: "planning_engine",
    label: "ConversationPlanningEngine",
    file: "src/lib/planning-engine-e022/ConversationPlanningEngine.ts",
    method: "plan(goal, options)",
    input: "GoalBridgeResult.goal",
    output: "PlanResult { plan: ExecutionPlan }",
    caller: "ConversationPipeline",
    next: "ConversationRuntimeEngine",
    sprint: "E-02.2",
    integrated: "production",
    bypassNote: "Uses GoalCapabilityRegistry (E-02.2) — NOT PlannerEngine (EF-43). PlannerEngine is demo-only.",
  },
  {
    id: "runtime",
    label: "ConversationRuntimeEngine",
    file: "src/lib/runtime-engine/ConversationRuntimeEngine.ts",
    method: "execute(plan)",
    input: "ExecutionPlan",
    output: "ExecutionResult",
    caller: "ConversationPipeline",
    next: "ExecutionDispatcher → ConnectorCapabilityExecutor",
    sprint: "E-02.3",
    integrated: "production",
    bypassNote: null,
  },
  {
    id: "connector_router",
    label: "UniversalConnectorRouter",
    file: "src/lib/connector-router/UniversalConnectorRouter.ts",
    method: "route(connector, capability, parameters)",
    input: "ExecutionStep",
    output: "ConnectorResult",
    caller: "ConnectorCapabilityExecutor",
    next: "GitHub/Drive/Gmail Connector",
    sprint: "E-02.4",
    integrated: "production",
    bypassNote: null,
  },
  {
    id: "arbiter",
    label: "ResponseArbiter",
    file: "src/lib/response-arbiter/ResponseArbiter.ts",
    method: "arbitrate(candidates, context)",
    input: "ResponseCandidate[]",
    output: "ArbitrationResult { selected }",
    caller: "ConversationPipeline",
    next: "Stream → User",
    sprint: "E-02.3B",
    integrated: "production",
    bypassNote: null,
  },
];

// EF-43→EF-49 layers — demo only, not in production runtime
export const EF_DEMO_LAYERS: ArchitecturalLayer[] = [
  {
    id: "ef_goal_engine",
    label: "GoalEngine (EF-43)",
    file: "src/lib/goal-engine/GoalEngine.ts",
    method: "processIntent(userIntent, identityContext)",
    input: "UserIntent",
    output: "Goal (validated)",
    caller: "Demo pages (/sprint-ef43…ef49)",
    next: "CapabilityReasoningEngine",
    sprint: "EF-43",
    integrated: "demo_only",
    bypassNote: "NOT called by ConversationPipeline. ConversationGoalBridge is used instead (lightweight goal derivation).",
  },
  {
    id: "ef_cre",
    label: "CapabilityReasoningEngine (EF-48)",
    file: "src/lib/capability-reasoning/CapabilityReasoningEngine.ts",
    method: "reason(goal)",
    input: "Goal",
    output: "CapabilityGraph",
    caller: "Demo pages",
    next: "CapabilityBindingEngine",
    sprint: "EF-48",
    integrated: "demo_only",
    bypassNote: "NOT called by production runtime. Part of the EF cognitive pipeline (demo/certification only).",
  },
  {
    id: "ef_cbe",
    label: "CapabilityBindingEngine (EF-49)",
    file: "src/lib/capability-binding/CapabilityBindingEngine.ts",
    method: "bind(capabilityGraph)",
    input: "CapabilityGraph",
    output: "BoundCapabilityGraph",
    caller: "Demo pages",
    next: "StrategyGenerationEngine",
    sprint: "EF-49",
    integrated: "demo_only",
    bypassNote: "NOT called by production runtime. Certified internally within the EF pipeline.",
  },
  {
    id: "ef_sge",
    label: "StrategyGenerationEngine (EF-47/49)",
    file: "src/lib/strategy-generation/StrategyGenerationEngine.ts",
    method: "generate(goal, boundGraph?)",
    input: "Goal + BoundCapabilityGraph",
    output: "GenerationResult",
    caller: "Demo pages",
    next: "StrategySelectionEngine",
    sprint: "EF-47",
    integrated: "demo_only",
    bypassNote: "NOT called by production runtime. CBE→SGE integration certified (EF-49.1).",
  },
  {
    id: "ef_sse",
    label: "StrategySelectionEngine (EF-46)",
    file: "src/lib/strategy-selection/StrategySelectionEngine.ts",
    method: "select(goal, plan?, weights?)",
    input: "Goal",
    output: "SelectionResult",
    caller: "Demo pages",
    next: "CognitiveOrchestrator",
    sprint: "EF-46",
    integrated: "demo_only",
    bypassNote: null,
  },
  {
    id: "ef_co",
    label: "CognitiveOrchestrator (EF-43)",
    file: "src/lib/cognitive-orchestrator/CognitiveOrchestrator.ts",
    method: "orchestrate(goal)",
    input: "Goal",
    output: "CognitivePlan",
    caller: "Demo pages",
    next: "DynamicPlanningEngine",
    sprint: "EF-43",
    integrated: "demo_only",
    bypassNote: null,
  },
  {
    id: "ef_dpe",
    label: "DynamicPlanningEngine (EF-45)",
    file: "src/lib/cognitive-orchestrator/DynamicPlanningEngine.ts",
    method: "evaluate(plan, state)",
    input: "CognitivePlan",
    output: "PlanningRevision",
    caller: "Demo pages",
    next: "PlannerEngine",
    sprint: "EF-45",
    integrated: "demo_only",
    bypassNote: null,
  },
  {
    id: "ef_planner",
    label: "PlannerEngine (EF-43)",
    file: "src/lib/planner-engine/PlannerEngine.ts",
    method: "createPlan(goalId, identityContext)",
    input: "goalId",
    output: "ExecutionPlan",
    caller: "Demo pages",
    next: "ConnectorRouter (EF pipeline — not production)",
    sprint: "EF-43",
    integrated: "demo_only",
    bypassNote: "NOT called by production runtime. ConversationPlanningEngine (E-02.2) is used instead.",
  },
];