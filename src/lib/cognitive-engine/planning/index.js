// Planning Engine (Fase 3 — Sprint 18)
// Transforma Decision Result em plano estruturado. Nunca executa.

export {
  buildPlanResult,
  buildPlanStep,
  validatePlanResult,
  validatePlanStep,
  PLAN_RESULT_FIELDS,
  PLAN_STEP_FIELDS,
  PLAN_PRIORITY_LEVELS,
  PLAN_CONFIDENCE_LEVELS,
} from "./planResult";

export {
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
  getStats as getPlanningStats,
  getDecisionLog as getPlanningDecisionLog,
  _resetForTests as _resetPlanningForTests,
} from "./planningEngine";

export { runPlanningTests, PLANNING_TEST_CASES } from "./planningTests";