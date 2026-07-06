/**
 * Validator Tests (Sprint 30)
 * All validators return { valid, errors } and never throw.
 */

import {
  validateScenario,
  validateSimulation,
  validateEvent,
  validateAction,
  createValidators,
} from "../validators.js";
import { buildSimulatedEvent } from "../simulatedEvent.js";
import { buildSimulatedAction } from "../simulatedAction.js";
import { createScenario } from "../scenarioBuilder.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const VALIDATOR_TESTS = [
  {
    id: 131,
    name: "validateEvent returns valid for correct event",
    run: () => {
      _resetIdsForTests();
      const evt = buildSimulatedEvent({ eventType: "ORDER_CREATED" });
      return validateEvent(evt);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 132,
    name: "validateEvent returns invalid for missing eventType",
    run: () => {
      _resetIdsForTests();
      return validateEvent({ eventId: "sim-evt-1" });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 133,
    name: "validateEvent returns invalid for non-object",
    run: () => validateEvent(null),
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 134,
    name: "validateEvent returns invalid for bad priority",
    run: () => {
      _resetIdsForTests();
      return validateEvent({ eventId: "e1", eventType: "T", eventVersion: "1.0", priority: "BAD" });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("priority")),
  },
  {
    id: 135,
    name: "validateEvent never throws on undefined",
    run: () => {
      try {
        validateEvent(undefined);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 136,
    name: "validateAction returns valid for correct action",
    run: () => {
      _resetIdsForTests();
      const act = buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" });
      return validateAction(act);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 137,
    name: "validateAction returns invalid for missing actionType",
    run: () => validateAction({ actionId: "a1" }),
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 138,
    name: "validateAction returns invalid for non-object",
    run: () => validateAction("not an object"),
    assert: (r) => r.valid === false,
  },
  {
    id: 139,
    name: "validateAction never throws on null",
    run: () => {
      try {
        validateAction(null);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 140,
    name: "validateScenario returns valid for correct scenario",
    run: () => {
      _resetIdsForTests();
      const scn = createScenario({
        name: "S1",
        connectorConfig: { connectorName: "C1" },
        events: [],
        actions: [],
      });
      return validateScenario(scn);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 141,
    name: "validateScenario returns invalid for missing name",
    run: () => validateScenario({ scenarioId: "s1", events: [], actions: [] }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("name")),
  },
  {
    id: 142,
    name: "validateScenario returns invalid for bad failureConfig type",
    run: () => {
      _resetIdsForTests();
      return validateScenario({
        scenarioId: "s1",
        name: "S1",
        events: [],
        actions: [],
        connectorConfig: {},
        failureConfig: { type: "INVALID_FAILURE" },
      });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("failureConfig")),
  },
  {
    id: 143,
    name: "validateScenario never throws on null",
    run: () => {
      try {
        validateScenario(null);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 144,
    name: "validateSimulation returns valid for correct result",
    run: () => {
      _resetIdsForTests();
      return validateSimulation({
        executionId: "sim-exec-1",
        scenarioId: "sim-scn-1",
        status: "COMPLETED",
        steps: [],
      });
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 145,
    name: "validateSimulation returns invalid for bad status",
    run: () =>
      validateSimulation({
        executionId: "e1",
        scenarioId: "s1",
        status: "INVALID",
        steps: [],
      }),
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("status")),
  },
  {
    id: 146,
    name: "validateSimulation returns invalid for non-object",
    run: () => validateSimulation(42),
    assert: (r) => r.valid === false,
  },
  {
    id: 147,
    name: "validateSimulation never throws on undefined",
    run: () => {
      try {
        validateSimulation(undefined);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false,
  },
  {
    id: 148,
    name: "createValidators returns frozen object with all validators",
    run: () => {
      const v = createValidators();
      return {
        frozen: Object.isFrozen(v),
        hasScenario: typeof v.validateScenario === "function",
        hasSimulation: typeof v.validateSimulation === "function",
        hasEvent: typeof v.validateEvent === "function",
        hasAction: typeof v.validateAction === "function",
      };
    },
    assert: (r) => r.frozen && r.hasScenario && r.hasSimulation && r.hasEvent && r.hasAction,
  },
];