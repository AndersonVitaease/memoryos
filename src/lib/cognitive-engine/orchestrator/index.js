/**
 * Cognitive Orchestrator — Sprint 23
 *
 * Nova camada do Cognitive Engine que coexiste com a Sprint 14.
 *
 * Sprint 23 introduz o Cognitive Orchestrator: o coordenador central
 * que decide quais módulos cognitivos participarão do processamento
 * de cada requisição, produzindo um CognitiveExecutionPlan.
 *
 * Nesta Sprint, nenhum módulo é executado — apenas o plano é construído.
 *
 * Sprint 14 permanece congelada e intocada.
 * O Memory Engine permanece completamente isolado.
 */

// === Contract ===
export {
  buildExecutionPlan,
  validateExecutionPlan,
  COGNITIVE_EXECUTION_PLAN_FIELDS,
  COGNITIVE_MODULES,
  REQUEST_TYPES,
  _resetIdsForTests,
} from "./cognitivePlan";

// === Orchestrator ===
export {
  createExecutionPlan,
  validatePlan,
  describePlan,
  runPlanner,
  getStats,
  getDecisionLog,
  _resetForTests,
} from "./cognitiveOrchestrator";

// === Tests ===
export { runCognitivePlanTests, COGNITIVE_PLAN_TEST_CASES } from "./cognitivePlanTests";