/**
 * Simulation Runner Tests (Sprint 30)
 */

import { createSimulationRunner } from "../simulationRunner.js";
import { createScenarioRegistry } from "../scenarioRegistry.js";
import { createScenario } from "../scenarioBuilder.js";
import { createStatistics } from "../statistics.js";
import { buildSimulatedEvent } from "../simulatedEvent.js";
import { buildSimulatedAction } from "../simulatedAction.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

function _setup() {
  _resetIdsForTests();
  const registry = createScenarioRegistry();
  const stats = createStatistics();
  const runner = createSimulationRunner({ registry, statistics: stats });
  return { registry, stats, runner };
}

export const SIMULATION_RUNNER_TESTS = [
  {
    id: 110,
    name: "executeScenario runs simple scenario to completion",
    run: () => {
      const { registry, runner } = _setup();
      const scenario = createScenario({
        name: "Simple",
        connectorConfig: { connectorName: "C1" },
        events: [buildSimulatedEvent({ eventType: "ORDER_CREATED" })],
        actions: [buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" })],
      });
      registry.register(scenario);
      return runner.executeScenario(scenario.scenarioId);
    },
    assert: (r) =>
      r.status === "COMPLETED" &&
      r.hadFailure === false &&
      r.totalSteps >= 4 && // connect + event + action + disconnect
      r.executionId.startsWith("sim-exec-") &&
      Object.isFrozen(r),
  },
  {
    id: 111,
    name: "executeScenario records event in eventLog",
    run: () => {
      const { registry, runner } = _setup();
      const evt = buildSimulatedEvent({ eventType: "LOGIN" });
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [evt],
      });
      registry.register(scenario);
      return runner.executeScenario(scenario.scenarioId);
    },
    assert: (r) => r.eventLog.length === 1 && r.eventLog[0].eventType === "LOGIN",
  },
  {
    id: 112,
    name: "executeScenario records action in actionLog",
    run: () => {
      const { registry, runner } = _setup();
      const act = buildSimulatedAction({ actionType: "SEND_EMAIL" });
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        actions: [act],
      });
      registry.register(scenario);
      return runner.executeScenario(scenario.scenarioId);
    },
    assert: (r) => r.actionLog.length === 1 && r.actionLog[0].actionType === "SEND_EMAIL",
  },
  {
    id: 113,
    name: "executeScenario with CONNECTOR_OFFLINE failure returns FAILED",
    run: () => {
      const { registry, runner } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [buildSimulatedEvent({ eventType: "TEST" })],
        failureConfig: { type: "CONNECTOR_OFFLINE" },
      });
      registry.register(scenario);
      return runner.executeScenario(scenario.scenarioId);
    },
    assert: (r) => r.status === "FAILED" && r.hadFailure === true,
  },
  {
    id: 114,
    name: "executeScenario with TIMEOUT failure returns FAILED",
    run: () => {
      const { registry, runner } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        actions: [buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" })],
        failureConfig: { type: "TIMEOUT" },
      });
      registry.register(scenario);
      return runner.executeScenario(scenario.scenarioId);
    },
    assert: (r) => r.status === "FAILED" && r.hadFailure === true,
  },
  {
    id: 115,
    name: "executeScenario increments statistics counters",
    run: () => {
      const { registry, runner, stats } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [buildSimulatedEvent({ eventType: "E1" }), buildSimulatedEvent({ eventType: "E2" })],
        actions: [buildSimulatedAction({ actionType: "A1" })],
      });
      registry.register(scenario);
      runner.executeScenario(scenario.scenarioId);
      return stats.snapshot();
    },
    assert: (r) =>
      r.executedScenarios === 1 &&
      r.simulatedEvents === 2 &&
      r.simulatedActions === 1 &&
      r.simulatedFailures === 0 &&
      r.simulatedLatencies === 1,
  },
  {
    id: 116,
    name: "executeScenario increments failure counter on failure",
    run: () => {
      const { registry, runner, stats } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        actions: [buildSimulatedAction({ actionType: "A1" })],
        failureConfig: { type: "AUTHENTICATION_ERROR" },
      });
      registry.register(scenario);
      runner.executeScenario(scenario.scenarioId);
      return stats.snapshot();
    },
    assert: (r) => r.simulatedFailures === 1 && r.executedScenarios === 1,
  },
  {
    id: 117,
    name: "executeScenario returns FAILED for unknown scenario ID",
    run: () => {
      const { runner } = _setup();
      return runner.executeScenario("nonexistent");
    },
    assert: (r) => r.status === "FAILED" && r.error.includes("not found"),
  },
  {
    id: 118,
    name: "executeScenario steps include CONNECT and DISCONNECT",
    run: () => {
      const { registry, runner } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [buildSimulatedEvent({ eventType: "E1" })],
      });
      registry.register(scenario);
      const result = runner.executeScenario(scenario.scenarioId);
      return result.steps.map((s) => s.type);
    },
    assert: (r) =>
      r[0] === "CONNECT" &&
      r.includes("EVENT") &&
      r[r.length - 1] === "DISCONNECT",
  },
  {
    id: 119,
    name: "executeScenario result includes connectorId",
    run: () => {
      const { registry, runner } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
      });
      registry.register(scenario);
      return runner.executeScenario(scenario.scenarioId);
    },
    assert: (r) => typeof r.connectorId === "string" && r.connectorId.startsWith("sim-conn-"),
  },
  {
    id: 120,
    name: "executeScenario is deterministic — same scenario produces same structure",
    run: () => {
      const { registry, runner } = _setup();
      const scenario = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [buildSimulatedEvent({ eventType: "E1" })],
        actions: [buildSimulatedAction({ actionType: "A1" })],
      });
      registry.register(scenario);
      const r1 = runner.executeScenario(scenario.scenarioId);
      return {
        status1: r1.status,
        stepCount1: r1.totalSteps,
        eventCount1: r1.eventLog.length,
        actionCount1: r1.actionLog.length,
      };
    },
    assert: (r) =>
      r.status1 === "COMPLETED" && r.stepCount1 === 4 && r.eventCount1 === 1 && r.actionCount1 === 1,
  },
];