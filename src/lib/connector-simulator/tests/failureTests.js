/**
 * Failure Simulator Tests (Sprint 30)
 */

import {
  simulateFailure,
  buildFailureError,
  isFailureType,
  listFailureTypes,
  FAILURE_TYPES,
} from "../failureSimulator.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const FAILURE_TESTS = [
  {
    id: 55,
    name: "simulateFailure returns TIMEOUT failure without throwing",
    run: () => {
      _resetIdsForTests();
      return simulateFailure({ type: "TIMEOUT" });
    },
    assert: (r) =>
      r.failureId === "sim-fail-1" &&
      r.type === "TIMEOUT" &&
      r.message.includes("timeout") &&
      r.simulated === true &&
      Object.isFrozen(r),
  },
  {
    id: 56,
    name: "simulateFailure returns AUTHENTICATION_ERROR",
    run: () => {
      _resetIdsForTests();
      return simulateFailure({ type: "AUTHENTICATION_ERROR" });
    },
    assert: (r) => r.type === "AUTHENTICATION_ERROR" && r.simulated === true,
  },
  {
    id: 57,
    name: "simulateFailure returns PERMISSION_ERROR",
    run: () => simulateFailure({ type: "PERMISSION_ERROR" }),
    assert: (r) => r.type === "PERMISSION_ERROR",
  },
  {
    id: 58,
    name: "simulateFailure returns CONNECTOR_OFFLINE",
    run: () => simulateFailure({ type: "CONNECTOR_OFFLINE" }),
    assert: (r) => r.type === "CONNECTOR_OFFLINE",
  },
  {
    id: 59,
    name: "simulateFailure returns INVALID_RESPONSE",
    run: () => simulateFailure({ type: "INVALID_RESPONSE" }),
    assert: (r) => r.type === "INVALID_RESPONSE",
  },
  {
    id: 60,
    name: "simulateFailure returns UNKNOWN_ERROR",
    run: () => simulateFailure({ type: "UNKNOWN_ERROR" }),
    assert: (r) => r.type === "UNKNOWN_ERROR",
  },
  {
    id: 61,
    name: "simulateFailure defaults unknown type to UNKNOWN_ERROR",
    run: () => simulateFailure({ type: "NONEXISTENT" }),
    assert: (r) => r.type === "UNKNOWN_ERROR",
  },
  {
    id: 62,
    name: "simulateFailure accepts custom message",
    run: () =>
      simulateFailure({ type: "TIMEOUT", message: "Custom timeout message" }),
    assert: (r) => r.message === "Custom timeout message",
  },
  {
    id: 63,
    name: "simulateFailure generates sequential IDs",
    run: () => {
      _resetIdsForTests();
      return [
        simulateFailure({ type: "TIMEOUT" }).failureId,
        simulateFailure({ type: "TIMEOUT" }).failureId,
      ];
    },
    assert: (r) => r[0] === "sim-fail-1" && r[1] === "sim-fail-2",
  },
  {
    id: 64,
    name: "simulateFailure includes actionId and connectorId",
    run: () => {
      _resetIdsForTests();
      return simulateFailure({
        type: "TIMEOUT",
        actionId: "sim-act-1",
        connectorId: "sim-conn-1",
      });
    },
    assert: (r) => r.actionId === "sim-act-1" && r.connectorId === "sim-conn-1",
  },
  {
    id: 65,
    name: "buildFailureError returns frozen error descriptor",
    run: () => buildFailureError("TIMEOUT"),
    assert: (r) =>
      r.type === "TIMEOUT" &&
      r.simulated === true &&
      Object.isFrozen(r) &&
      typeof r.message === "string",
  },
  {
    id: 66,
    name: "isFailureType returns true for valid types",
    run: () => isFailureType("TIMEOUT"),
    assert: (r) => r === true,
  },
  {
    id: 67,
    name: "isFailureType returns false for invalid types",
    run: () => isFailureType("NONEXISTENT"),
    assert: (r) => r === false,
  },
  {
    id: 68,
    name: "listFailureTypes returns all 6 types",
    run: () => listFailureTypes().length,
    assert: (r) => r === 6,
  },
  {
    id: 69,
    name: "simulateFailure never throws even with no args",
    run: () => {
      _resetIdsForTests();
      try {
        const result = simulateFailure();
        return { threw: false, type: result.type };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw === false && r.type === "UNKNOWN_ERROR",
  },
  {
    id: 70,
    name: "FAILURE_TYPES exported from failureSimulator",
    run: () => FAILURE_TYPES.length,
    assert: (r) => r === 6,
  },
];