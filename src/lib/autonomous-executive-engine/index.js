/**
 * Autonomous Executive Engine — Sprint 26
 *
 * Camada máxima de coordenação do MemoryOS.
 * Apenas coordena. Nunca executa.
 */

// === Contracts ===
export {
  buildGoal,
  buildSupervisionEntry,
  buildCoordinationStep,
  buildCoordinationPlan,
  buildCoordinationResult,
  validateGoal,
  validateSupervisionEntry,
  validateCoordinationPlan,
  validateCoordinationResult,
  GOAL_FIELDS,
  SUPERVISION_ENTRY_FIELDS,
  COORDINATION_PLAN_FIELDS,
  COORDINATION_RESULT_FIELDS,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  SUPERVISION_KINDS,
  COORDINATION_STATUSES,
  _resetIdsForTests,
} from "./executiveContracts";

// === Engine ===
export {
  registerEngine,
  registerSpecialist,
  registerService,
  registerConnector,
  getSupervisionEntry,
  listSupervisionEntries,
  setGoal,
  getGoal,
  listGoals,
  updateGoal,
  coordinate,
  supervise,
  describeResult,
  getStats,
  _resetForTests,
} from "./autonomousExecutiveEngine";

// === Tests ===
export { runExecutiveEngineTests, EXECUTIVE_ENGINE_TEST_CASES } from "./executiveTests";