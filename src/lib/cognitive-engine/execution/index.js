// Execution Engine (Fase 3 — Sprint 19)
// Executa um Plan Result de forma determinística. Nunca aprende.

export {
  buildExecutionResult,
  buildStepResult,
  validateExecutionResult,
  validateStepResult,
  EXECUTION_RESULT_FIELDS,
  STEP_RESULT_FIELDS,
  EXECUTION_STATUSES,
  STEP_STATUSES,
  STEP_STATUS_PENDING,
  STEP_STATUS_RUNNING,
  STEP_STATUS_COMPLETED,
  STEP_STATUS_SKIPPED,
  STEP_STATUS_FAILED,
} from "./executionResult";

export {
  executePlan,
  executeStep,
  validateExecutionOrder,
  updateExecutionStatus,
  calculateExecutionCost,
  calculateExecutionTime,
  calculateSuccessRate,
  describeExecution,
  validateExecution,
  getStats as getExecutionStats,
  getDecisionLog as getExecutionDecisionLog,
  _resetForTests as _resetExecutionForTests,
} from "./executionEngine";

export { runExecutionTests, EXECUTION_TEST_CASES } from "./executionTests";