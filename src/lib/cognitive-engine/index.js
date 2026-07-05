/**
 * Cognitive Engine (Fase 3)
 *
 * Camada de coordenação cognitiva do MemoryOS.
 * Decidir quais componentes participam do processamento de cada mensagem.
 */

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
  getStats,
  getDecisionLog,
  _resetForTests,
} from "./cognitiveOrchestrator";

export { runCognitiveTests, COGNITIVE_TEST_CASES } from "./cognitiveTests";