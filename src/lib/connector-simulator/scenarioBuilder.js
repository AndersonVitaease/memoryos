/**
 * Scenario Builder (Sprint 30)
 *
 * Criação e clonagem de cenários de simulação.
 *
 * Cenários são totalmente reproduzíveis: mesma entrada → mesma saída.
 *
 * createScenario()  — cria cenário frozen
 * cloneScenario()   — clona com overrides
 * executeScenario() — delega para o SimulationRunner
 * removeScenario()  — delega para o ScenarioRegistry
 */

import {
  SCENARIO_STATUSES,
  deepFreeze,
  nextSimScenarioId,
} from "./simulatorContracts.js";
import { simulateLatency } from "./latencySimulator.js";

export function createScenario({
  name,
  description,
  connectorConfig,
  events,
  actions,
  latency,
  failureConfig,
  metadata,
} = {}) {
  if (!name || typeof name !== "string") {
    throw new Error("scenario name is required");
  }

  const latencyResult = simulateLatency(latency || "INSTANT");

  return deepFreeze({
    scenarioId: nextSimScenarioId(),
    name,
    description: typeof description === "string" ? description : "",
    status: "DRAFT",
    connectorConfig:
      connectorConfig && typeof connectorConfig === "object"
        ? deepFreeze({ ...connectorConfig })
        : deepFreeze({}),
    events: Array.isArray(events)
      ? events.map((e) => deepFreeze({ ...e }))
      : [],
    actions: Array.isArray(actions)
      ? actions.map((a) => deepFreeze({ ...a }))
      : [],
    latency: latencyResult,
    failureConfig:
      failureConfig && typeof failureConfig === "object"
        ? deepFreeze({ ...failureConfig })
        : null,
    metadata: metadata && typeof metadata === "object" ? deepFreeze({ ...metadata }) : deepFreeze({}),
    createdAt: new Date().toISOString(),
  });
}

export function cloneScenario(scenario, overrides = {}) {
  if (!scenario || typeof scenario !== "object") {
    throw new Error("cloneScenario requires a scenario object");
  }

  const base = {
    name: scenario.name,
    description: scenario.description,
    connectorConfig: { ...scenario.connectorConfig },
    events: scenario.events.map((e) => ({ ...e })),
    actions: scenario.actions.map((a) => ({ ...a })),
    latency: scenario.latency,
    failureConfig: scenario.failureConfig ? { ...scenario.failureConfig } : null,
    metadata: { ...scenario.metadata },
  };

  const merged = { ...base, ...overrides };

  return deepFreeze({
    scenarioId: nextSimScenarioId(),
    name: merged.name,
    description: typeof merged.description === "string" ? merged.description : "",
    status: "DRAFT",
    connectorConfig: deepFreeze({ ...merged.connectorConfig }),
    events: merged.events.map((e) => deepFreeze({ ...e })),
    actions: merged.actions.map((a) => deepFreeze({ ...a })),
    latency: merged.latency,
    failureConfig: merged.failureConfig ? deepFreeze({ ...merged.failureConfig }) : null,
    metadata: deepFreeze({ ...merged.metadata }),
    createdAt: new Date().toISOString(),
  });
}

export function createScenarioBuilder({ registry, runner }) {
  return Object.freeze({
    createScenario(config) {
      return createScenario(config);
    },
    cloneScenario(scenario, overrides) {
      return cloneScenario(scenario, overrides);
    },
    executeScenario(scenarioId) {
      if (!runner) throw new Error("runner not provided to scenario builder");
      return runner.executeScenario(scenarioId);
    },
    removeScenario(scenarioId) {
      if (!registry) throw new Error("registry not provided to scenario builder");
      return registry.unregister(scenarioId);
    },
  });
}