/**
 * Cognitive Engine (Fase 3)
 *
 * Camada de coordenação cognitiva do MemoryOS.
 * Decide quais componentes participam do processamento de cada mensagem
 * e executa os planos resultantes.
 *
 * Sprint 14 — Cognitive Orchestrator (CONGELADO):
 *   - Cria Cognitive Plans a partir de mensagens
 *   - Classifica complexidade (determinístico)
 *   - Valida, roteiriza, cancela e descreve planos
 *
 * Sprint 15 — Cognitive Pipeline:
 *   - Executa Cognitive Plans etapa por etapa
 *   - Registra status, tempo, resultado e erro
 *   - Suporta pause / resume / cancel
 *   - Contrato Pipeline Execution
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

// === Sprint 15 ===
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