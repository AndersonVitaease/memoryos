/**
 * Cognitive Engine (Fase 3)
 *
 * Camada de coordenação cognitiva do MemoryOS.
 * Decide quais componentes participam do processamento de cada mensagem,
 * executa os planos resultantes e constrói raciocínio estruturado.
 *
 * Sprint 14 — Cognitive Orchestrator (CONGELADO):
 *   - Cria Cognitive Plans a partir de mensagens
 *   - Classifica complexidade (determinístico)
 *   - Valida, roteiriza, cancela e descreve planos
 *
 * Sprint 15 — Cognitive Pipeline (CONGELADO):
 *   - Executa Cognitive Plans etapa por etapa
 *   - Registra status, tempo, resultado e erro
 *   - Suporta pause / resume / cancel
 *   - Contrato Pipeline Execution
 *
 * Sprint 16 — Reasoning Engine (CONGELADO):
 *   - Transforma resultados do Pipeline em raciocínio estruturado
 *   - Extrai premissas, agrupa evidências, detecta conflitos
 *   - Gera hipóteses, conclusões e calcula confiança
 *   - Contrato Reasoning Graph
 *
 * Sprint 17 — Decision Engine:
 *   - Seleciona a melhor decisão a partir de um Reasoning Graph
 *   - Avalia alternativas, seleciona conclusão
 *   - Calcula risco e confiança (determinístico)
 *   - Produz justificativa
 *   - Contrato Decision Result
 */

// === Sprint 14 (congelado) ===
export {
  buildCognitivePlan,
  validateCognitivePlan,
  COMPLEXITY_LEVELS,
  PRIORITY_LEVELS,
  PARTICIPANTS,
  COGNITIVE_PLAN_FIELDS,
} from "./cognitivePlan";

export {
  createPlan,
  validatePlan,
  routePlan,
  cancelPlan,
  describePlan,
  classifyComplexity,
  getStats as getOrchestratorStats,
  getDecisionLog as getOrchestratorDecisionLog,
  _resetForTests as _resetOrchestratorForTests,
} from "./cognitiveOrchestrator";

export { runCognitiveTests, COGNITIVE_TEST_CASES } from "./cognitiveTests";

// === Sprint 15 (congelado) ===
export {
  buildPipelineExecution,
  validatePipelineExecution,
  EXECUTION_STATUSES,
  STEP_STATUSES,
  PIPELINE_EXECUTION_FIELDS,
} from "./pipelineExecution";

export {
  executePlan,
  executeStep,
  cancelExecution,
  pauseExecution,
  resumeExecution,
  describeExecution,
  getExecution,
  validateExecution,
  registerStepExecutor,
  clearStepExecutors,
  getStats as getPipelineStats,
  getDecisionLog as getPipelineDecisionLog,
  _resetForTests as _resetPipelineForTests,
} from "./cognitivePipeline";

export { runPipelineTests, PIPELINE_TEST_CASES } from "./pipelineTests";

// === Sprint 16 ===
export {
  buildReasoningGraph,
  validateReasoningGraph,
  CONFIDENCE_LEVELS,
  REASONING_GRAPH_FIELDS,
} from "./reasoningGraph";

export {
  buildReasoning,
  extractPremises,
  collectEvidence,
  detectConflicts,
  generateHypotheses,
  generateConclusions,
  calculateConfidence,
  describeReasoning,
  validateReasoning,
  getStats as getReasoningStats,
  getDecisionLog as getReasoningDecisionLog,
  _resetForTests as _resetReasoningForTests,
} from "./reasoningEngine";

export { runReasoningTests, REASONING_TEST_CASES } from "./reasoningTests";

// === Sprint 17 ===
export {
  buildDecisionResult,
  validateDecisionResult,
  RISK_LEVELS,
  CONFIDENCE_LEVELS as DECISION_CONFIDENCE_LEVELS,
  DECISION_RESULT_FIELDS,
} from "./decisionResult";

export {
  makeDecision,
  evaluateAlternatives,
  selectConclusion,
  calculateRisk,
  calculateConfidence as calculateDecisionConfidence,
  justifyDecision,
  describeDecision,
  validateDecision,
  getStats as getDecisionStats,
  getDecisionLog as getDecisionEngineDecisionLog,
  _resetForTests as _resetDecisionForTests,
} from "./decisionEngine";

export { runDecisionTests, DECISION_TEST_CASES } from "./decisionTests";

// === Sprint 18 ===
export {
  buildPlanResult,
  buildPlanStep,
  validatePlanResult,
  validatePlanStep,
  PLAN_RESULT_FIELDS,
  PLAN_STEP_FIELDS,
  PLAN_PRIORITY_LEVELS,
  PLAN_CONFIDENCE_LEVELS,
} from "./planning/planResult";

export {
  createPlan as createPlanningPlan,
  decomposeGoal,
  orderSteps,
  detectDependencies,
  estimateCost,
  estimateTime,
  generateFallback,
  optimizePlan,
  describePlan as describePlanningPlan,
  validatePlan as validatePlanningPlan,
  getStats as getPlanningStats,
  getDecisionLog as getPlanningDecisionLog,
  _resetForTests as _resetPlanningForTests,
} from "./planning/planningEngine";

export { runPlanningTests, PLANNING_TEST_CASES } from "./planning/planningTests";