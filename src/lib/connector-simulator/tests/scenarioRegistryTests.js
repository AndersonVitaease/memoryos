/**
 * Scenario Registry Tests (Sprint 30)
 */

import { createScenarioRegistry } from "../scenarioRegistry.js";
import { createScenario } from "../scenarioBuilder.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const SCENARIO_REGISTRY_TESTS = [
  {
    id: 99,
    name: "register stores scenario and returns success",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      const scenario = createScenario({ name: "S1" });
      return reg.register(scenario);
    },
    assert: (r) => r.success === true && r.scenarioId === "sim-scn-1",
  },
  {
    id: 100,
    name: "exists returns true for registered scenario",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      const scenario = createScenario({ name: "S1" });
      reg.register(scenario);
      return reg.exists(scenario.scenarioId);
    },
    assert: (r) => r === true,
  },
  {
    id: 101,
    name: "exists returns false for unregistered scenario",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      return reg.exists("sim-scn-1");
    },
    assert: (r) => r === false,
  },
  {
    id: 102,
    name: "unregister removes scenario",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      const scenario = createScenario({ name: "S1" });
      reg.register(scenario);
      const result = reg.unregister(scenario.scenarioId);
      return { result, exists: reg.exists(scenario.scenarioId) };
    },
    assert: (r) => r.result.success === true && r.exists === false,
  },
  {
    id: 103,
    name: "unregister returns success false for unknown ID",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      return reg.unregister("nonexistent");
    },
    assert: (r) => r.success === false,
  },
  {
    id: 104,
    name: "list returns all registered scenarios",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      reg.register(createScenario({ name: "S1" }));
      reg.register(createScenario({ name: "S2" }));
      reg.register(createScenario({ name: "S3" }));
      return reg.list();
    },
    assert: (r) => r.length === 3 && Object.isFrozen(r),
  },
  {
    id: 105,
    name: "get returns scenario by ID",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      const scenario = createScenario({ name: "S1" });
      reg.register(scenario);
      return reg.get(scenario.scenarioId);
    },
    assert: (r) => r !== null && r.name === "S1",
  },
  {
    id: 106,
    name: "get returns null for unknown ID",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      return reg.get("nonexistent");
    },
    assert: (r) => r === null,
  },
  {
    id: 107,
    name: "count returns number of scenarios",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      reg.register(createScenario({ name: "S1" }));
      reg.register(createScenario({ name: "S2" }));
      return reg.count();
    },
    assert: (r) => r === 2,
  },
  {
    id: 108,
    name: "reset clears all scenarios",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      reg.register(createScenario({ name: "S1" }));
      reg.register(createScenario({ name: "S2" }));
      const result = reg.reset();
      return { result, count: reg.count() };
    },
    assert: (r) => r.result.success === true && r.count === 0,
  },
  {
    id: 109,
    name: "register returns failure for missing scenarioId",
    run: () => {
      _resetIdsForTests();
      const reg = createScenarioRegistry();
      return reg.register({});
    },
    assert: (r) => r.success === false,
  },
];