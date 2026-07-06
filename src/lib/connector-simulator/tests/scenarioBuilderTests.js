/**
 * Scenario Builder Tests (Sprint 30)
 */

import { createScenario, cloneScenario, createScenarioBuilder } from "../scenarioBuilder.js";
import { createScenarioRegistry } from "../scenarioRegistry.js";
import { createSimulationRunner } from "../simulationRunner.js";
import { createStatistics } from "../statistics.js";
import { buildSimulatedEvent } from "../simulatedEvent.js";
import { buildSimulatedAction } from "../simulatedAction.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const SCENARIO_BUILDER_TESTS = [
  {
    id: 87,
    name: "createScenario returns frozen scenario with ID",
    run: () => {
      _resetIdsForTests();
      return createScenario({ name: "Test Scenario" });
    },
    assert: (r) =>
      r.scenarioId === "sim-scn-1" &&
      r.name === "Test Scenario" &&
      r.status === "DRAFT" &&
      Object.isFrozen(r),
  },
  {
    id: 88,
    name: "createScenario includes events and actions arrays",
    run: () => {
      _resetIdsForTests();
      const evt = buildSimulatedEvent({ eventType: "ORDER_CREATED" });
      const act = buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" });
      return createScenario({ name: "S1", events: [evt], actions: [act] });
    },
    assert: (r) => r.events.length === 1 && r.actions.length === 1,
  },
  {
    id: 89,
    name: "createScenario includes connectorConfig",
    run: () => {
      _resetIdsForTests();
      return createScenario({
        name: "S1",
        connectorConfig: { connectorName: "TestConn" },
      });
    },
    assert: (r) => r.connectorConfig.connectorName === "TestConn" && Object.isFrozen(r.connectorConfig),
  },
  {
    id: 90,
    name: "createScenario includes latency",
    run: () => {
      _resetIdsForTests();
      return createScenario({ name: "S1", latency: "SLOW" });
    },
    assert: (r) => r.latency.latencyMs === 1000 && r.latency.preset === "SLOW",
  },
  {
    id: 91,
    name: "createScenario includes failureConfig",
    run: () => {
      _resetIdsForTests();
      return createScenario({
        name: "S1",
        failureConfig: { type: "TIMEOUT" },
      });
    },
    assert: (r) => r.failureConfig !== null && r.failureConfig.type === "TIMEOUT",
  },
  {
    id: 92,
    name: "createScenario throws on missing name",
    run: () => {
      _resetIdsForTests();
      try {
        createScenario({});
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
  {
    id: 93,
    name: "cloneScenario creates new scenario with new ID",
    run: () => {
      _resetIdsForTests();
      const original = createScenario({ name: "Original" });
      const clone = cloneScenario(original);
      return { originalId: original.scenarioId, cloneId: clone.scenarioId };
    },
    assert: (r) => r.originalId === "sim-scn-1" && r.cloneId === "sim-scn-2",
  },
  {
    id: 94,
    name: "cloneScenario applies overrides",
    run: () => {
      _resetIdsForTests();
      const original = createScenario({ name: "Original" });
      const clone = cloneScenario(original, { name: "Cloned" });
      return { cloneName: clone.name, originalName: original.name };
    },
    assert: (r) => r.cloneName === "Cloned" && r.originalName === "Original",
  },
  {
    id: 95,
    name: "cloneScenario is frozen",
    run: () => {
      _resetIdsForTests();
      const original = createScenario({ name: "Original" });
      return cloneScenario(original);
    },
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 96,
    name: "createScenarioBuilder returns builder with all methods",
    run: () => {
      _resetIdsForTests();
      const registry = createScenarioRegistry();
      const stats = createStatistics();
      const runner = createSimulationRunner({ registry, statistics: stats });
      const builder = createScenarioBuilder({ registry, runner });
      return {
        hasCreate: typeof builder.createScenario === "function",
        hasClone: typeof builder.cloneScenario === "function",
        hasExecute: typeof builder.executeScenario === "function",
        hasRemove: typeof builder.removeScenario === "function",
      };
    },
    assert: (r) => r.hasCreate && r.hasClone && r.hasExecute && r.hasRemove,
  },
  {
    id: 97,
    name: "scenario builder executeScenario delegates to runner",
    run: () => {
      _resetIdsForTests();
      const registry = createScenarioRegistry();
      const stats = createStatistics();
      const runner = createSimulationRunner({ registry, statistics: stats });
      const builder = createScenarioBuilder({ registry, runner });
      const scenario = builder.createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [buildSimulatedEvent({ eventType: "LOGIN" })],
        actions: [buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" })],
      });
      registry.register(scenario);
      return builder.executeScenario(scenario.scenarioId);
    },
    assert: (r) => r.status === "COMPLETED" && r.totalSteps > 0,
  },
  {
    id: 98,
    name: "scenario builder removeScenario delegates to registry",
    run: () => {
      _resetIdsForTests();
      const registry = createScenarioRegistry();
      const runner = createSimulationRunner({ registry, statistics: createStatistics() });
      const builder = createScenarioBuilder({ registry, runner });
      const scenario = builder.createScenario({ name: "S1" });
      registry.register(scenario);
      const result = builder.removeScenario(scenario.scenarioId);
      return { result, exists: registry.exists(scenario.scenarioId) };
    },
    assert: (r) => r.result.success === true && r.exists === false,
  },
];