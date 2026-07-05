/**
 * Planning Engine (Fase 3 — Sprint 18)
 *
 * Responsabilidade única: PLANEAR. Transforma um Decision Result em um
 * plano estruturado com etapas, dependências, custo, tempo e fallback.
 *
 * O QUE FAZ:
 *   - Receber Decision Result
 *   - Decompor objetivo em etapas
 *   - Ordenar etapas deterministicamente
 *   - Detectar dependências entre etapas
 *   - Estimar custo e tempo
 *   - Gerar plano alternativo (fallback)
 *   - Otimizar removendo redundâncias
 *   - Produzir descrição legível
 *
 * O QUE NÃO FAZ:
 *   - Executar ações
 *   - Aprender
 *   - Consultar memória
 *   - Chamar LLM
 *   - Alterar o Decision Engine
 *   - Reflection / Self Evaluation / Retry automático
 *
 * Arquitetura:
 *   Decision → Planning → Execution (futuro) → Learning (futuro)
 */

import {
  buildPlanResult,
  buildPlanStep,
  validatePlanResult,
  PLAN_PRIORITY_LEVELS,
  PLAN_CONFIDENCE_LEVELS,
  PLAN_RESULT_FIELDS,
  PLAN_STEP_FIELDS,
} from "./planResult";

// === Observability ===
const _stats = {
  plansCreated: 0,
  stepsGenerated: 0,
  dependenciesDetected: 0,
  fallbacksGenerated: 0,
  plansOptimized: 0,
  totalProcessingTimeMs: 0,
  operations: 0,
  priorityDistribution: { low: 0, normal: 0, high: 0, critical: 0 },
  confidenceDistribution: { LOW: 0, MEDIUM: 0, HIGH: 0 },
};

const _eventLog = [];

function _log(event, data) {
  _eventLog.push({ event, ...data, timestamp: new Date().toISOString() });
}

// === Decompose Goal ===

/**
 * Divide um objetivo em etapas menores (determinístico).
 * Cada etapa é derivada da conclusão selecionada e do contexto da decisão.
 */
export function decomposeGoal(decision, goal) {
  const steps = [];

  if (!decision || !decision.selectedConclusion) {
    // Sem conclusão — plano mínimo genérico
    steps.push(
      buildPlanStep({
        id: "step-1",
        description: `Avaliar objetivo: ${goal || "objetivo não definido"}`,
        order: 1,
        required: true,
        estimatedTime: 10,
        estimatedCost: 1,
      })
    );
    return steps;
  }

  const conclusion = decision.selectedConclusion;
  const alternatives = decision.alternatives || [];

  // Etapa 1: Preparação
  steps.push(
    buildPlanStep({
      id: "step-1",
      description: `Preparar contexto para: ${conclusion.statement}`,
      order: 1,
      required: true,
      estimatedTime: 15,
      estimatedCost: 2,
    })
  );

  // Etapa 2: Execução principal
  steps.push(
    buildPlanStep({
      id: "step-2",
      description: `Executar: ${conclusion.statement}`,
      order: 2,
      required: true,
      estimatedTime: 30,
      estimatedCost: 5,
    })
  );

  // Etapa 3: Verificação (se houver alternativas)
  if (alternatives.length > 1) {
    steps.push(
      buildPlanStep({
        id: "step-3",
        description: `Verificar resultado contra ${alternatives.length - 1} alternativa(s)`,
        order: 3,
        required: false,
        estimatedTime: 10,
        estimatedCost: 1,
      })
    );
  }

  // Etapa 4: Finalização
  steps.push(
    buildPlanStep({
      id: `step-${steps.length + 1}`,
      description: "Finalizar e registrar resultado",
      order: steps.length + 1,
      required: true,
      estimatedTime: 5,
      estimatedCost: 1,
    })
  );

  _stats.stepsGenerated += steps.length;
  _log("goalDecomposed", { stepCount: steps.length });
  return steps;
}

// === Order Steps ===

/**
 * Ordena etapas deterministicamente por ordem.
 */
export function orderSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return [...steps].sort((a, b) => a.order - b.order);
}

// === Detect Dependencies ===

/**
 * Detecta dependências entre etapas (determinístico).
 * Cada etapa depende da anterior (cadeia linear).
 */
export function detectDependencies(steps) {
  const deps = [];

  if (!Array.isArray(steps) || steps.length < 2) {
    return deps;
  }

  for (let i = 1; i < steps.length; i++) {
    deps.push({
      from: steps[i - 1].id,
      to: steps[i].id,
      type: "sequential",
    });
  }

  // Dependências condicionais: etapas não obrigatórias dependem da anterior obrigatória
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].required && i > 0) {
      // Já coberta pela cadeia sequencial
    }
  }

  _stats.dependenciesDetected += deps.length;
  _log("dependenciesDetected", { count: deps.length });
  return deps;
}

// === Estimate Cost ===

/**
 * Calcula custo estimado total (determinístico).
 */
export function estimateCost(steps) {
  if (!Array.isArray(steps)) return 0;
  return steps.reduce((total, step) => total + (step.estimatedCost || 0), 0);
}

// === Estimate Time ===

/**
 * Calcula tempo estimado total (determinístico).
 */
export function estimateTime(steps) {
  if (!Array.isArray(steps)) return 0;
  return steps.reduce((total, step) => total + (step.estimatedTime || 0), 0);
}

// === Generate Fallback ===

/**
 * Gera um plano alternativo caso alguma etapa falhe (determinístico).
 */
export function generateFallback(steps, decision) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return {
      strategy: "abort",
      description: "Nenhuma etapa disponível — abortar execução",
      steps: [],
    };
  }

  // Encontra etapas obrigatórias
  const required = steps.filter((s) => s.required);
  const optional = steps.filter((s) => !s.required);

  // Se há alternativas na decisão, usa a segunda melhor
  const alternatives = decision?.alternatives || [];
  const fallbackConclusion = alternatives.length > 1 ? alternatives[1] : null;

  return {
    strategy: fallbackConclusion ? "alternative_conclusion" : "skip_optional",
    description: fallbackConclusion
      ? `Usar conclusão alternativa: ${fallbackConclusion.statement}`
      : `Pular ${optional.length} etapa(s) opcional(is) e manter etapas obrigatórias`,
    steps: required.map((s, i) =>
      buildPlanStep({
        id: `fallback-${s.id}`,
        description: s.description,
        order: i + 1,
        required: true,
        estimatedTime: s.estimatedTime,
        estimatedCost: s.estimatedCost,
      })
    ),
  };
}

// === Optimize Plan ===

/**
 * Remove redundâncias e agrupa etapas equivalentes (determinístico).
 */
export function optimizePlan(steps, dependencies) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { steps: [], dependencies: [] };
  }

  // Agrupa etapas com mesma descrição (mantém a primeira ocorrência)
  const seen = new Map();
  const optimized = [];
  const idMap = new Map(); // old id → new id

  for (const step of steps) {
    const key = step.description.trim().toLowerCase();
    if (seen.has(key)) {
      // Mantém o mapeamento para dependências
      idMap.set(step.id, seen.get(key));
      _stats.plansOptimized++;
    } else {
      const newId = `step-${optimized.length + 1}`;
      seen.set(key, newId);
      idMap.set(step.id, newId);
      optimized.push(
        buildPlanStep({
          ...step,
          id: newId,
          order: optimized.length + 1,
        })
      );
    }
  }

  // Reajusta dependências com IDs novos
  const newDeps = (dependencies || [])
    .map((d) => ({
      from: idMap.get(d.from) || d.from,
      to: idMap.get(d.to) || d.to,
      type: d.type,
    }))
    .filter((d) => d.from !== d.to); // remove auto-dependências

  _log("planOptimized", { originalCount: steps.length, optimizedCount: optimized.length });
  return { steps: optimized, dependencies: newDeps };
}

// === Create Plan ===

/**
 * Cria um Plan Result completo a partir de um Decision Result.
 *
 * @param {Object} decision — Decision Result
 * @returns {Object} Plan Result
 */
export function createPlan(decision) {
  _stats.operations++;
  const startTime = Date.now();
  _log("planStarted", { decisionId: decision?.decisionId });

  const goal = decision?.selectedDecision?.statement || decision?.selectedConclusion?.statement || "objetivo indefinido";
  const selectedDecision = decision?.selectedConclusion || decision?.selectedDecision || null;

  // 1. Decompor objetivo em etapas
  let steps = decomposeGoal(decision, goal);

  // 2. Ordenar etapas
  steps = orderSteps(steps);

  // 3. Detectar dependências
  let dependencies = detectDependencies(steps);

  // 4. Otimizar plano
  const optimized = optimizePlan(steps, dependencies);
  steps = optimized.steps;
  dependencies = optimized.dependencies;

  // 5. Estimar custo e tempo
  const cost = estimateCost(steps);
  const time = estimateTime(steps);

  // 6. Gerar fallback
  const fallback = generateFallback(steps, decision);

  // 7. Determinar prioridade e confiança
  const priority = _determinePriority(decision, cost, time);
  const confidence = _determineConfidence(decision);

  // 8. Resultado esperado
  const expectedOutcome = selectedDecision ? selectedDecision.statement : goal;

  const plan = buildPlanResult({
    decisionId: decision?.decisionId || null,
    goal,
    selectedDecision,
    steps,
    dependencies,
    estimatedCost: cost,
    estimatedTime: time,
    priority,
    expectedOutcome,
    fallbackPlan: fallback,
    confidence,
  });

  _stats.plansCreated++;
  _stats.fallbacksGenerated++;
  _stats.priorityDistribution[priority]++;
  _stats.confidenceDistribution[confidence]++;
  const elapsed = Date.now() - startTime;
  _stats.totalProcessingTimeMs += elapsed;
  _log("planCompleted", { planId: plan.planId, elapsed });

  return plan;
}

function _determinePriority(decision, cost, time) {
  if (!decision) return "normal";
  if (decision.riskLevel === "CRITICAL") return "critical";
  if (decision.riskLevel === "HIGH") return "high";
  if (decision.riskLevel === "MEDIUM") return "normal";
  if (cost > 20 || time > 60) return "high";
  return "normal";
}

function _determineConfidence(decision) {
  if (!decision) return "LOW";
  if (decision.confidence === "HIGH") return "HIGH";
  if (decision.confidence === "MEDIUM") return "MEDIUM";
  return "LOW";
}

// === Describe Plan ===

/**
 * Produz descrição legível do plano.
 */
export function describePlan(plan) {
  if (!plan) return null;

  const lines = [
    `Plano ${plan.planId}`,
    `  Objetivo: ${plan.goal}`,
    `  Decisão: ${plan.decisionId || "—"}`,
    `  Prioridade: ${plan.priority}`,
    `  Confiança: ${plan.confidence}`,
    `  Custo estimado: ${plan.estimatedCost}`,
    `  Tempo estimado: ${plan.estimatedTime}ms`,
    `  Etapas: ${plan.steps.length}`,
    `  Dependências: ${plan.dependencies.length}`,
    `  Resultado esperado: ${plan.expectedOutcome}`,
  ];

  if (plan.steps.length > 0) {
    lines.push("  Etapas:");
    for (const step of plan.steps) {
      lines.push(`    ${step.order}. [${step.required ? "OBR" : "OPT"}] ${step.description} (${step.estimatedTime}ms, ${step.estimatedCost}c)`);
    }
  }

  if (plan.fallbackPlan) {
    lines.push(`  Fallback: ${plan.fallbackPlan.description}`);
  }

  return lines.join("\n");
}

// === Validate ===

export function validatePlan(plan) {
  return validatePlanResult(plan);
}

// === Observability ===

export function getStats() {
  return {
    ..._stats,
    averageProcessingTimeMs:
      _stats.plansCreated > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.plansCreated)
        : 0,
    averageCost:
      _stats.plansCreated > 0
        ? Math.round(_stats.stepsGenerated / _stats.plansCreated * 10) / 10
        : 0,
    averageTime:
      _stats.plansCreated > 0
        ? Math.round(_stats.totalProcessingTimeMs / _stats.plansCreated)
        : 0,
    eventLog: [..._eventLog],
  };
}

export function getDecisionLog() {
  return [..._eventLog];
}

export function _resetForTests() {
  _stats.plansCreated = 0;
  _stats.stepsGenerated = 0;
  _stats.dependenciesDetected = 0;
  _stats.fallbacksGenerated = 0;
  _stats.plansOptimized = 0;
  _stats.totalProcessingTimeMs = 0;
  _stats.operations = 0;
  _stats.priorityDistribution = { low: 0, normal: 0, high: 0, critical: 0 };
  _stats.confidenceDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  _eventLog.length = 0;
}

export default {
  createPlan,
  decomposeGoal,
  orderSteps,
  detectDependencies,
  estimateCost,
  estimateTime,
  generateFallback,
  optimizePlan,
  describePlan,
  validatePlan,
  getStats,
  getDecisionLog,
  _resetForTests,
};