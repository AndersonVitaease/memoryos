/**
 * Cognitive Orchestrator (Fase 3 — Cognitive Engine)
 *
 * Responsabilidade única: COORDENAR. Decidir quais componentes devem
 * participar do processamento de uma mensagem e construir um Cognitive Plan.
 *
 * O QUE FAZ:
 *   - Receber mensagem + contexto + sessão + estado do sistema
 *   - Decidir quais camadas participarão (Memory, Capabilities, Services, etc.)
 *   - Classificar complexidade (determinístico)
 *   - Construir Cognitive Plan
 *   - Validar planos
 *   - Roteirizar planos (descrever, não executar)
 *
 * O QUE NÃO FAZ:
 *   - Executar regras de negócio
 *   - Responder diretamente ao usuário
 *   - Chamar APIs externas diretamente
 *   - Substituir o Planner
 *   - Executar qualquer componente diretamente
 *   - Planejamento com IA / Auto Planejamento / Reflection / Self Evaluation / Learning / Auto Retry / Auto Recovery
 *
 * Arquitetura:
 *   Usuário → Cognitive Orchestrator → Goal Detector → Memory Engine →
 *   Capability Layer → Service Layer → Specialist Layer → Policy Engine →
 *   Planner → LLM → Resposta
 */

import {
  buildCognitivePlan,
  validateCognitivePlan,
  COMPLEXITY_LEVELS,
  PRIORITY_LEVELS,
  PARTICIPANTS,
} from "./cognitivePlan";

// === Plan store (in-memory) ===
const _plans = new Map();

// === Observability ===
const _stats = {
  planCreated: 0,
  planValidated: 0,
  planExecuted: 0,
  planCancelled: 0,
  invalidPlansRejected: 0,
  decisionCount: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
  complexityDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
  participantUsage: {},
};

const _decisionLog = [];

function _log(event, data) {
  // eslint-disable-next-line no-console
  console.debug(`[CognitiveOrchestrator:${event}]`, data);
}

// === Deterministic keyword detection ===

const KEYWORDS = {
  memory: ["lembrar", "lembra", "esqueci", "histórico", "historico", "antes", "passado", "memória", "memoria", "você disse", "voce disse", "disseste"],
  specialist: ["auditoria", "auditar", "arquitetura", "financeiro", "jurídico", "juridico", "marketing", "rh", "recursos humanos", "projeto"],
  capability: ["analisar", "relatório", "relatorio", "documento", "ler arquivo", "extrair", "código", "codigo", "código-fonte", "arquivo"],
  service: ["email", "gmail", "agenda", "calendário", "calendario", "drive", "sheets", "notificação", "notificacao", "enviar"],
  policy: ["política", "politica", "regra", "regras", "permissão", "permissao", "segurança", "seguranca", "compliance", "privacidade"],
  llm: ["explicar", "resumir", "resumo", "traduzir", "criar", "escrever", "gerar", "analisar texto", "comparar", "sugerir", "recomendar"],
};

function _detectKeyword(message, keywordList) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return keywordList.some((kw) => lower.includes(kw));
}

// === Complexity Classification (deterministic) ===

export function classifyComplexity(decisions) {
  const participantCount = [
    decisions.requiresMemory,
    decisions.requiresCapabilities,
    decisions.requiresServices,
    decisions.requiresSpecialists,
    decisions.requiresPolicy,
    decisions.requiresLLM,
  ].filter(Boolean).length;

  if (participantCount >= 5) return "CRITICAL";
  if (participantCount >= 3) return "HIGH";
  if (participantCount >= 2) return "MEDIUM";
  return "LOW";
}

function _priorityFromComplexity(complexity) {
  const map = { LOW: "low", MEDIUM: "normal", HIGH: "high", CRITICAL: "critical" };
  return map[complexity] || "normal";
}

// === Core: decide participants ===

function _decideParticipants(message, context = {}, systemState = {}) {
  const decisions = {
    requiresMemory: false,
    requiresCapabilities: false,
    requiresServices: false,
    requiresSpecialists: false,
    requiresPolicy: false,
    requiresLLM: false,
  };

  if (_detectKeyword(message, KEYWORDS.memory) || context.hasHistory) {
    decisions.requiresMemory = true;
  }
  if (_detectKeyword(message, KEYWORDS.capability)) {
    decisions.requiresCapabilities = true;
  }
  if (_detectKeyword(message, KEYWORDS.service)) {
    decisions.requiresServices = true;
  }
  if (_detectKeyword(message, KEYWORDS.specialist)) {
    decisions.requiresSpecialists = true;
  }
  if (_detectKeyword(message, KEYWORDS.policy) || systemState.complianceRequired) {
    decisions.requiresPolicy = true;
  }
  // LLM is needed unless it's a pure memory lookup with no generation
  if (_detectKeyword(message, KEYWORDS.llm) || (!decisions.requiresMemory && !decisions.requiresCapabilities)) {
    decisions.requiresLLM = true;
  }

  _stats.decisionCount += Object.values(decisions).filter(Boolean).length;
  return decisions;
}

function _buildSteps(decisions, complexity) {
  const steps = [];
  let order = 1;

  steps.push({ order: order++, participant: "GoalDetector", action: "detectGoal", priority: _priorityFromComplexity(complexity) });

  if (decisions.requiresMemory) {
    steps.push({ order: order++, participant: "MemoryEngine", action: "retrieveContext", priority: _priorityFromComplexity(complexity) });
  }
  if (decisions.requiresCapabilities) {
    steps.push({ order: order++, participant: "CapabilityLayer", action: "executeCapability", priority: _priorityFromComplexity(complexity) });
  }
  if (decisions.requiresServices) {
    steps.push({ order: order++, participant: "ServiceLayer", action: "invokeService", priority: _priorityFromComplexity(complexity) });
  }
  if (decisions.requiresSpecialists) {
    steps.push({ order: order++, participant: "SpecialistLayer", action: "routeSpecialist", priority: _priorityFromComplexity(complexity) });
  }
  if (decisions.requiresPolicy) {
    steps.push({ order: order++, participant: "PolicyEngine", action: "evaluatePolicy", priority: _priorityFromComplexity(complexity) });
  }
  if (decisions.requiresLLM) {
    steps.push({ order: order++, participant: "Planner", action: "plan", priority: _priorityFromComplexity(complexity) });
    steps.push({ order: order++, participant: "LLM", action: "generate", priority: _priorityFromComplexity(complexity) });
  }

  return steps;
}

// === Public API ===

/**
 * Cria um Cognitive Plan a partir da mensagem, contexto e estado do sistema.
 *
 * @param {Object} params
 * @param {string} params.message — mensagem do usuário
 * @param {Object} [params.context] — contexto da conversa
 * @param {Object} [params.session] — dados da sessão
 * @param {Object} [params.systemState] — estado do sistema
 * @returns {Object} Cognitive Plan
 */
export function createPlan({ message, context = {}, session = {}, systemState = {} } = {}) {
  const startTime = Date.now();
  _stats.operations++;

  if (!message || typeof message !== "string") {
    _stats.invalidPlansRejected++;
    throw new Error("message is required and must be a string");
  }

  const decisions = _decideParticipants(message, context, systemState);
  const complexity = classifyComplexity(decisions);
  const priority = _priorityFromComplexity(complexity);

  const steps = _buildSteps(decisions, complexity);

  const participants = steps.map((s) => s.participant);
  // Include ConnectorLayer if services are needed
  if (decisions.requiresServices) {
    participants.push("ConnectorLayer");
    steps.splice(steps.length - 1, 0, { order: steps.length, participant: "ConnectorLayer", action: "connect", priority });
    // Re-number
    steps.forEach((s, i) => { s.order = i + 1; });
  }

  const plan = buildCognitivePlan({
    goal: message.length > 200 ? message.slice(0, 200) + "..." : message,
    steps,
    participants: [...new Set(participants)],
    priority,
    ...decisions,
    estimatedComplexity: complexity,
  });

  _plans.set(plan.planId, plan);
  _stats.planCreated++;
  _stats.complexityDistribution[complexity]++;
  for (const p of plan.participants) {
    _stats.participantUsage[p] = (_stats.participantUsage[p] || 0) + 1;
  }

  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _decisionLog.push({ event: "planCreated", planId: plan.planId, complexity, elapsed });
  _log("planCreated", { planId: plan.planId, complexity });

  return plan;
}

/**
 * Valida um Cognitive Plan.
 */
export function validatePlan(plan) {
  _stats.operations++;
  _stats.planValidated++;
  const result = validateCognitivePlan(plan);
  if (!result.valid) {
    _stats.invalidPlansRejected++;
  }
  _decisionLog.push({ event: "planValidated", planId: plan?.planId, valid: result.valid });
  return result;
}

/**
 * Roteiriza um plano — descreve a ordem de execução sem executar.
 */
export function routePlan(planId) {
  _stats.operations++;
  const plan = _plans.get(planId);
  if (!plan) return null;
  _stats.planExecuted++;
  _decisionLog.push({ event: "planExecuted", planId });
  return {
    planId,
    executionOrder: plan.steps.map((s) => ({
      step: s.order,
      participant: s.participant,
      action: s.action,
      priority: s.priority,
    })),
    complexity: plan.estimatedComplexity,
  };
}

/**
 * Cancela um plano.
 */
export function cancelPlan(planId) {
  _stats.operations++;
  const plan = _plans.get(planId);
  if (!plan) return false;
  _plans.delete(planId);
  _stats.planCancelled++;
  _decisionLog.push({ event: "planCancelled", planId });
  return true;
}

/**
 * Descreve um plano em texto legível.
 */
export function describePlan(planId) {
  const plan = _plans.get(planId);
  if (!plan) return null;
  const lines = [
    `Plano ${plan.planId}`,
    `  Goal: ${plan.goal}`,
    `  Complexidade: ${plan.estimatedComplexity}`,
    `  Prioridade: ${plan.priority}`,
    `  Participantes: ${plan.participants.join(", ")}`,
    `  Etapas:`,
    ...plan.steps.map((s) => `    ${s.order}. ${s.participant} → ${s.action} [${s.priority}]`),
  ];
  return lines.join("\n");
}

// === Observability ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.operations > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.operations)
        : 0,
    totalPlans: _plans.size,
    decisionLog: [..._decisionLog],
  };
}

export function getDecisionLog() {
  return [..._decisionLog];
}

export function _resetForTests() {
  _plans.clear();
  _stats.planCreated = 0;
  _stats.planValidated = 0;
  _stats.planExecuted = 0;
  _stats.planCancelled = 0;
  _stats.invalidPlansRejected = 0;
  _stats.decisionCount = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _stats.complexityDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  _stats.participantUsage = {};
  _decisionLog.length = 0;
}

export default {
  createPlan,
  validatePlan,
  routePlan,
  cancelPlan,
  describePlan,
  classifyComplexity,
  getStats,
  getDecisionLog,
  _resetForTests,
};