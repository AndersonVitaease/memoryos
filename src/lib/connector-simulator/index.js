/**
 * Connector Simulator Framework (Sprint 30)
 *
 * Ambiente determinístico para desenvolvimento, validação e testes
 * de Connectors do MemoryOS.
 *
 * Princípios:
 *   — Completamente determinístico
 *   — Totalmente desacoplado
 *   — Não conhece Engines ou domínio da aplicação
 *   — Não executa IA, HTTP, Banco de Dados ou APIs externas
 *   — Conhece apenas: Connectors, Eventos, Ações, Cenários
 *   — IDs sequenciais (nenhum UUID, Math.random ou Date.now como ID)
 *   — Todos os objetos são frozen
 *
 * Compatível com:
 *   — Enterprise Integration Layer
 *   — Universal Event Bus
 *   — Connector SDK
 */

// === Contracts ===
export {
  EVENT_FIELDS,
  PRIORITIES,
  EVENT_STATUSES,
  ACTION_FIELDS,
  EVENT_TYPES,
  ACTION_TYPES,
  AUTHENTICATION_TYPES,
  CAPABILITIES,
  CONNECTOR_STATUSES,
  LIFECYCLE_STATES,
  CATEGORIES,
  CONNECTOR_TYPES,
  LATENCY_PRESETS,
  LATENCY_LABELS,
  FAILURE_TYPES,
  FAILURE_MESSAGES,
  RESPONSE_STATUSES,
  SCENARIO_STATUSES,
  SIMULATION_STATUSES,
  SIMULATED_CONNECTOR_STATES,
  nextSimConnectorId,
  nextSimEventId,
  nextSimActionId,
  nextSimResponseId,
  nextSimFailureId,
  nextSimScenarioId,
  nextSimExecutionId,
  nextSimStepId,
  _resetIdsForTests,
  deepFreeze,
} from "./simulatorContracts.js";

// === Simulated Entities ===
export { buildSimulatedEvent } from "./simulatedEvent.js";
export { buildSimulatedAction } from "./simulatedAction.js";
export { buildSimulatedResponse } from "./simulatedResponse.js";

// === Latency & Failure ===
export {
  simulateLatency,
  getLatencyPreset,
  listLatencyPresets,
} from "./latencySimulator.js";
export {
  simulateFailure,
  buildFailureError,
  isFailureType,
  listFailureTypes,
} from "./failureSimulator.js";

// === Simulated Connector ===
export { createSimulatedConnector } from "./simulatedConnector.js";

// === Scenario ===
export {
  createScenario,
  cloneScenario,
  createScenarioBuilder,
} from "./scenarioBuilder.js";
export { createScenarioRegistry } from "./scenarioRegistry.js";

// === Simulation Runner ===
export { createSimulationRunner } from "./simulationRunner.js";

// === Statistics ===
export { createStatistics } from "./statistics.js";

// === Validators ===
export {
  validateScenario,
  validateSimulation,
  validateEvent,
  validateAction,
  createValidators,
} from "./validators.js";