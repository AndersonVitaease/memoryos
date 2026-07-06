/**
 * Cognitive Orchestrator (Sprint 23 — Cognitive Orchestrator)
 *
 * Coordenador central do Cognitive Engine.
 *
 * Responsabilidade única: decidir quais módulos cognitivos participarão
 * do processamento de cada requisição e construir o CognitiveExecutionPlan.
 *
 * O QUE FAZ:
 *   - Receber User Input, Conversation Context, Session State,
 *     System Context e Memory Context (quando disponível)
 *   - Determinar o requestType
 *   - Selecionar módulos obrigatórios e opcionais
 *   - Definir a ordem de execução
 *   - Definir grupos paralelos (quando aplicável)
 *   - Produzir um CognitiveExecutionPlan
 *
 * O QUE NÃO FAZ:
 *   - Executar raciocínio
 *   - Responder perguntas
 *   - Chamar LLM
 *   - Acessar banco de dados
 *   - Executar qualquer módulo
 *   - Tomar decisões cognitivas
 *   - Modificar a Sprint 14
 *   - Modificar o Memory Engine
 *   - Modificar qualquer Sprint anterior
 *
 * Sprint 23 é uma nova camada que coexiste com a Sprint 14.
 */

import {
  buildExecutionPlan,
  validateExecutionPlan,
  COGNITIVE_MODULES,
  REQUEST_TYPES,
  _resetIdsForTests,
} from "./cognitivePlan";

// === Observability ===

const _stats = {
  plansCreated: 0,
  plansValidated: 0,
  plansRejected: 0,
  requestTypeDistribution: {},
  moduleUsage: {},
  totalProcessingTimeMs: 0,
  eventLog: [],
};

function _initModuleUsage() {
  for (const m of COGNITIVE_MODULES) {
    _stats.moduleUsage[m] = 0;
  }
}
_initModuleUsage();

function _log(event, data) {
  _stats.eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Request Type Detection (deterministic, keyword-based) ===

const REQUEST_TYPE_KEYWORDS = {
  image_generation: ["criar imagem", "gerar imagem", "create image", "generate image", "desenhar", "draw", "imagem de", "crie uma imagem", "uma imagem"],
  voice_generation: ["gerar voz", "gerar áudio", "generate voice", "generate audio", "falar", "narrar"],
  knowledge_search: ["pesquisar", "buscar informação", "search", "knowledge", "wikipedia", "google"],
  memory_query: ["lembrar", "minha memória", "o que eu disse", "recall", "what did i", "faturamento", "histórico"],
  task_planning: ["planejar", "criar plano", "organizar tarefas", "plan", "schedule", "todo"],
};

function _detectRequestType(userInput) {
  if (!userInput || typeof userInput !== "string") return "general";
  const lower = userInput.toLowerCase();
  for (const [type, keywords] of Object.entries(REQUEST_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return type;
    }
  }
  return "question";
}

// === Module Selection (deterministic, based on requestType) ===

// Cada requestType tem um pipeline canônico de módulos obrigatórios.
const PIPELINES = {
  question: [
    "InputAnalysis",
    "IntentClassifier",
    "MemoryRetrieval",
    "Reasoning",
    "ResponseComposer",
  ],
  image_generation: [
    "InputAnalysis",
    "IntentClassifier",
    "ImageGeneration",
    "ResponseComposer",
  ],
  voice_generation: [
    "InputAnalysis",
    "IntentClassifier",
    "VoiceGeneration",
    "ResponseComposer",
  ],
  knowledge_search: [
    "InputAnalysis",
    "IntentClassifier",
    "KnowledgeSearch",
    "Reasoning",
    "ResponseComposer",
  ],
  memory_query: [
    "InputAnalysis",
    "IntentClassifier",
    "MemoryRetrieval",
    "Reasoning",
    "ResponseComposer",
  ],
  task_planning: [
    "InputAnalysis",
    "IntentClassifier",
    "MemoryRetrieval",
    "Planner",
    "ResponseComposer",
  ],
  general: [
    "InputAnalysis",
    "IntentClassifier",
    "ResponseComposer",
  ],
};

// Módulos opcionais que podem participar de certos tipos.
const OPTIONAL_MODULES = {
  question: ["ToolSelection", "SafetyEngine"],
  image_generation: ["SafetyEngine"],
  voice_generation: ["SafetyEngine"],
  knowledge_search: ["ToolSelection", "SafetyEngine"],
  memory_query: ["SafetyEngine", "MemoryUpdate"],
  task_planning: ["ToolSelection", "SafetyEngine"],
  general: ["SafetyEngine"],
};

function _selectModules(requestType) {
  const required = PIPELINES[requestType] || PIPELINES.general;
  const optional = OPTIONAL_MODULES[requestType] || [];
  return { required: [...required], optional: [...optional] };
}

// === Create Execution Plan ===

/**
 * Cria um CognitiveExecutionPlan a partir do contexto da requisição.
 *
 * @param {Object} context
 * @param {string} context.userInput          — entrada do usuário
 * @param {Object} [context.conversationContext] — contexto da conversa
 * @param {Object} [context.sessionState]       — estado da sessão
 * @param {Object} [context.systemContext]      — contexto do sistema
 * @param {Object} [context.memoryContext]      — contexto de memória
 * @returns {Object} CognitiveExecutionPlan
 */
export function createExecutionPlan(context = {}) {
  const startTime = Date.now();
  const userInput = context.userInput || "";
  const requestType = _detectRequestType(userInput);

  const { required, optional } = _selectModules(requestType);

  const plan = buildExecutionPlan({
    requestType,
    requiredModules: required,
    optionalModules: optional,
    executionOrder: required,
    parallelGroups: [],
    metadata: {
      hasConversationContext: !!context.conversationContext,
      hasSessionState: !!context.sessionState,
      hasSystemContext: !!context.systemContext,
      hasMemoryContext: !!context.memoryContext,
    },
  });

  _stats.plansCreated++;
  _stats.requestTypeDistribution[requestType] = (_stats.requestTypeDistribution[requestType] || 0) + 1;
  for (const m of required) {
    _stats.moduleUsage[m] = (_stats.moduleUsage[m] || 0) + 1;
  }
  _stats.totalProcessingTimeMs += Date.now() - startTime;
  _log("planCreated", { planId: plan.planId, requestType, modules: required.length });

  return plan;
}

// === Validate Plan ===

export function validatePlan(plan) {
  const result = validateExecutionPlan(plan);
  _stats.plansValidated++;
  if (!result.valid) {
    _stats.plansRejected++;
    _log("planRejected", { error: result.error });
  }
  return result;
}

// === Describe Plan ===

export function describePlan(plan) {
  if (!plan) return null;

  const lines = [
    `Plano ${plan.planId}`,
    `  Tipo: ${plan.requestType}`,
    `  Criado em: ${plan.createdAt}`,
    `  Etapas estimadas: ${plan.estimatedSteps}`,
    `  Módulos obrigatórios: ${plan.requiredModules.join(" → ")}`,
  ];

  if (plan.optionalModules.length > 0) {
    lines.push(`  Módulos opcionais: ${plan.optionalModules.join(", ")}`);
  }

  if (plan.executionOrder.length > 0) {
    lines.push(`  Ordem de execução:`);
    plan.executionOrder.forEach((m, i) => {
      lines.push(`    ${i + 1}. ${m}`);
    });
  }

  if (plan.parallelGroups.length > 0) {
    lines.push(`  Grupos paralelos:`);
    plan.parallelGroups.forEach((g, i) => {
      lines.push(`    Grupo ${i + 1}: [${g.join(", ")}]`);
    });
  }

  const meta = plan.metadata;
  if (meta && Object.keys(meta).length > 0) {
    lines.push(`  Metadados:`);
    for (const [k, v] of Object.entries(meta)) {
      lines.push(`    ${k}: ${v ? "sim" : "não"}`);
    }
  }

  return lines.join("\n");
}

// === Run Planner ===

/**
 * Ponto de entrada do orquestrador.
 * Nesta Sprint, apenas cria e retorna o plano.
 * Nenhum módulo é executado.
 *
 * @param {Object} context — contexto da requisição
 * @returns {Object} CognitiveExecutionPlan
 */
export function runPlanner(context = {}) {
  return createExecutionPlan(context);
}

// === Observability ===

export function getStats() {
  return {
    plansCreated: _stats.plansCreated,
    plansValidated: _stats.plansValidated,
    plansRejected: _stats.plansRejected,
    requestTypeDistribution: { ..._stats.requestTypeDistribution },
    moduleUsage: { ..._stats.moduleUsage },
    averageProcessingTime:
      _stats.plansCreated > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.plansCreated)
        : 0,
    eventLog: [..._stats.eventLog],
  };
}

export function getDecisionLog() {
  return [..._stats.eventLog];
}

export function _resetForTests() {
  _stats.plansCreated = 0;
  _stats.plansValidated = 0;
  _stats.plansRejected = 0;
  _stats.requestTypeDistribution = {};
  _initModuleUsage();
  _stats.totalProcessingTimeMs = 0;
  _stats.eventLog.length = 0;
  _resetIdsForTests();
}

export default {
  createExecutionPlan,
  validatePlan,
  describePlan,
  runPlanner,
  getStats,
  getDecisionLog,
  _resetForTests,
};