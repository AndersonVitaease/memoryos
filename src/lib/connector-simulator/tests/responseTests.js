/**
 * Simulated Response Tests (Sprint 30)
 */

import { buildSimulatedResponse } from "../simulatedResponse.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const RESPONSE_TESTS = [
  {
    id: 37,
    name: "buildSimulatedResponse creates response with required fields",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedResponse({ actionId: "sim-act-1", status: "SUCCESS" });
    },
    assert: (r) =>
      r.responseId === "sim-resp-1" &&
      r.actionId === "sim-act-1" &&
      r.status === "SUCCESS" &&
      Object.isFrozen(r),
  },
  {
    id: 38,
    name: "buildSimulatedResponse defaults to SUCCESS status",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedResponse({ actionId: "act-1" });
    },
    assert: (r) => r.status === "SUCCESS",
  },
  {
    id: 39,
    name: "buildSimulatedResponse accepts FAILURE status",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedResponse({ actionId: "act-1", status: "FAILURE", error: "denied" });
    },
    assert: (r) => r.status === "FAILURE" && r.error === "denied",
  },
  {
    id: 40,
    name: "buildSimulatedResponse deep-freezes data",
    run: () => {
      _resetIdsForTests();
      const resp = buildSimulatedResponse({
        actionId: "act-1",
        data: { nested: { value: 42 } },
      });
      return {
        dataFrozen: Object.isFrozen(resp.data),
        nestedFrozen: Object.isFrozen(resp.data.nested),
      };
    },
    assert: (r) => r.dataFrozen && r.nestedFrozen,
  },
  {
    id: 41,
    name: "buildSimulatedResponse generates sequential IDs",
    run: () => {
      _resetIdsForTests();
      return [
        buildSimulatedResponse({ actionId: "a" }).responseId,
        buildSimulatedResponse({ actionId: "b" }).responseId,
      ];
    },
    assert: (r) => r[0] === "sim-resp-1" && r[1] === "sim-resp-2",
  },
  {
    id: 42,
    name: "buildSimulatedResponse defaults invalid status to SUCCESS",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedResponse({ actionId: "a", status: "INVALID" });
    },
    assert: (r) => r.status === "SUCCESS",
  },
];