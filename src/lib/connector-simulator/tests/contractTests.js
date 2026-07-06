/**
 * Contract Tests (Sprint 30)
 * Validates constants, ID generation, deepFreeze, and reset.
 */

import {
  LATENCY_PRESETS,
  LATENCY_LABELS,
  FAILURE_TYPES,
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
} from "../simulatorContracts.js";

export const CONTRACT_TESTS = [
  {
    id: 1,
    name: "LATENCY_PRESETS has 5 presets",
    run: () => LATENCY_PRESETS.length,
    assert: (r) => r === 5,
  },
  {
    id: 2,
    name: "LATENCY_LABELS includes INSTANT through VERY_SLOW",
    run: () => LATENCY_LABELS,
    assert: (r) =>
      r.includes("INSTANT") && r.includes("FAST") && r.includes("NORMAL") &&
      r.includes("SLOW") && r.includes("VERY_SLOW"),
  },
  {
    id: 3,
    name: "FAILURE_TYPES has 6 types",
    run: () => FAILURE_TYPES.length,
    assert: (r) => r === 6,
  },
  {
    id: 4,
    name: "FAILURE_TYPES includes TIMEOUT and UNKNOWN_ERROR",
    run: () => FAILURE_TYPES,
    assert: (r) => r.includes("TIMEOUT") && r.includes("UNKNOWN_ERROR"),
  },
  {
    id: 5,
    name: "RESPONSE_STATUSES includes SUCCESS and FAILURE",
    run: () => RESPONSE_STATUSES,
    assert: (r) => r.includes("SUCCESS") && r.includes("FAILURE"),
  },
  {
    id: 6,
    name: "SCENARIO_STATUSES includes DRAFT and COMPLETED",
    run: () => SCENARIO_STATUSES,
    assert: (r) => r.includes("DRAFT") && r.includes("COMPLETED"),
  },
  {
    id: 7,
    name: "SIMULATION_STATUSES includes PENDING and COMPLETED",
    run: () => SIMULATION_STATUSES,
    assert: (r) => r.includes("PENDING") && r.includes("COMPLETED"),
  },
  {
    id: 8,
    name: "SIMULATED_CONNECTOR_STATES includes CREATED and CONNECTED",
    run: () => SIMULATED_CONNECTOR_STATES,
    assert: (r) => r.includes("CREATED") && r.includes("CONNECTED") && r.includes("DISCONNECTED"),
  },
  {
    id: 9,
    name: "Sequential connector IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimConnectorId(), nextSimConnectorId(), nextSimConnectorId()];
    },
    assert: (r) => r[0] === "sim-conn-1" && r[1] === "sim-conn-2" && r[2] === "sim-conn-3",
  },
  {
    id: 10,
    name: "Sequential event IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimEventId(), nextSimEventId()];
    },
    assert: (r) => r[0] === "sim-evt-1" && r[1] === "sim-evt-2",
  },
  {
    id: 11,
    name: "Sequential action IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimActionId(), nextSimActionId()];
    },
    assert: (r) => r[0] === "sim-act-1" && r[1] === "sim-act-2",
  },
  {
    id: 12,
    name: "Sequential response IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimResponseId(), nextSimResponseId()];
    },
    assert: (r) => r[0] === "sim-resp-1" && r[1] === "sim-resp-2",
  },
  {
    id: 13,
    name: "Sequential failure IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimFailureId(), nextSimFailureId()];
    },
    assert: (r) => r[0] === "sim-fail-1" && r[1] === "sim-fail-2",
  },
  {
    id: 14,
    name: "Sequential scenario IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimScenarioId(), nextSimScenarioId()];
    },
    assert: (r) => r[0] === "sim-scn-1" && r[1] === "sim-scn-2",
  },
  {
    id: 15,
    name: "Sequential execution IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimExecutionId(), nextSimExecutionId()];
    },
    assert: (r) => r[0] === "sim-exec-1" && r[1] === "sim-exec-2",
  },
  {
    id: 16,
    name: "Sequential step IDs are deterministic",
    run: () => {
      _resetIdsForTests();
      return [nextSimStepId(), nextSimStepId()];
    },
    assert: (r) => r[0] === "sim-step-1" && r[1] === "sim-step-2",
  },
  {
    id: 17,
    name: "_resetIdsForTests zeroes all counters",
    run: () => {
      nextSimConnectorId();
      nextSimEventId();
      nextSimScenarioId();
      _resetIdsForTests();
      return [
        nextSimConnectorId(),
        nextSimEventId(),
        nextSimScenarioId(),
      ];
    },
    assert: (r) =>
      r[0] === "sim-conn-1" && r[1] === "sim-evt-1" && r[2] === "sim-scn-1",
  },
  {
    id: 18,
    name: "deepFreeze freezes nested objects",
    run: () => {
      const obj = { a: { b: { c: 1 } } };
      deepFreeze(obj);
      return {
        outer: Object.isFrozen(obj),
        mid: Object.isFrozen(obj.a),
        inner: Object.isFrozen(obj.a.b),
      };
    },
    assert: (r) => r.outer && r.mid && r.inner,
  },
  {
    id: 19,
    name: "deepFreeze handles arrays",
    run: () => {
      const obj = { list: [1, 2, 3] };
      deepFreeze(obj);
      return { arrFrozen: Object.isFrozen(obj.list), outerFrozen: Object.isFrozen(obj) };
    },
    assert: (r) => r.arrFrozen && r.outerFrozen,
  },
  {
    id: 20,
    name: "deepFreeze is idempotent on already-frozen objects",
    run: () => {
      const obj = Object.freeze({ a: 1 });
      deepFreeze(obj);
      return { frozen: Object.isFrozen(obj) };
    },
    assert: (r) => r.frozen === true,
  },
];