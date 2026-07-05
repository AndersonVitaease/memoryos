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

// === Sprint 19 ===
export {
  buildExecutionResult,
  buildStepResult,
  validateExecutionResult,
  validateStepResult,
  EXECUTION_RESULT_FIELDS,
  STEP_RESULT_FIELDS,
  EXECUTION_STATUSES as EXEC_ENGINE_STATUSES,
  STEP_STATUSES as EXEC_STEP_STATUSES,
  STEP_STATUS_PENDING,
  STEP_STATUS_RUNNING,
  STEP_STATUS_COMPLETED,
  STEP_STATUS_SKIPPED,
  STEP_STATUS_FAILED,
} from "./execution/executionResult";

export {
  executePlan as executePlanS19,
  executeStep as executeStepS19,
  validateExecutionOrder,
  updateExecutionStatus,
  calculateExecutionCost,
  calculateExecutionTime,
  calculateSuccessRate,
  describeExecution as describeExecutionS19,
  validateExecution as validateExecutionS19,
  getStats as getExecutionStats,
  getDecisionLog as getExecutionDecisionLog,
  _resetForTests as _resetExecutionForTests,
} from "./execution/executionEngine";

export { runExecutionTests, EXECUTION_TEST_CASES } from "./execution/executionTests";

// === Sprint 20 ===
export {
  buildLearningResult,
  buildObservation,
  buildLesson,
  buildRecommendation,
  validateLearningResult,
  LEARNING_RESULT_FIELDS,
  LEARNING_STATUSES,
  LEARNING_CONFIDENCE_LEVELS,
} from "./learning/learningResult";

export {
  analyzeExecution,
  extractLessons,
  identifyStrengths,
  identifyWeaknesses,
  calculateLearningConfidence,
  generateRecommendations,
  describeLearning,
  validateLearning,
  getStats as getLearningStats,
  getDecisionLog as getLearningDecisionLog,
  _resetForTests as _resetLearningForTests,
} from "./learning/learningEngine";

export { runLearningTests, LEARNING_TEST_CASES } from "./learning/learningTests";

// === Sprint 21 ===
export {
  buildMemoryUpdateProposal,
  buildKnowledgeItem,
  buildSuggestedMemory,
  buildConflict,
  validateMemoryUpdateProposal,
  validateKnowledgeItem,
  MEMORY_UPDATE_PROPOSAL_FIELDS,
  KNOWLEDGE_ITEM_FIELDS,
  PROPOSAL_TYPES,
  PROPOSAL_PRIORITIES,
  PROPOSAL_CONFIDENCE_LEVELS,
} from "@/lib/memory-integration/memoryUpdateProposal";

export {
  createProposal,
  extractKnowledge,
  classifyKnowledge,
  prioritizeKnowledge,
  detectConflicts as detectProposalConflicts,
  calculateProposalConfidence,
  describeProposal,
  validateProposal,
  getStats as getMemoryIntegrationStats,
  getDecisionLog as getMemoryIntegrationDecisionLog,
  _resetForTests as _resetMemoryIntegrationForTests,
} from "@/lib/memory-integration/memoryIntegrationEngine";

export { runMemoryIntegrationTests, MEMORY_INTEGRATION_TEST_CASES } from "@/lib/memory-integration/memoryIntegrationTests";