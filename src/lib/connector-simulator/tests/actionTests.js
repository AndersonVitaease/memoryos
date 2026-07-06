/**
 * Simulated Action Tests (Sprint 30)
 */

import { buildSimulatedAction } from "../simulatedAction.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const ACTION_TESTS = [
  {
    id: 31,
    name: "buildSimulatedAction creates action with required fields",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" });
    },
    assert: (r) =>
      r.actionId === "sim-act-1" &&
      r.actionType === "SEARCH_CUSTOMER" &&
      r.actionVersion === "1.0.0" &&
      typeof r.timestamp === "string" &&
      Object.isFrozen(r),
  },
  {
    id: 32,
    name: "buildSimulatedAction deep-freezes payload",
    run: () => {
      _resetIdsForTests();
      const act = buildSimulatedAction({
        actionType: "SEND_EMAIL",
        payload: { to: "test@test.com", body: "hello" },
      });
      return { frozen: Object.isFrozen(act.payload) };
    },
    assert: (r) => r.frozen,
  },
  {
    id: 33,
    name: "buildSimulatedAction includes connectorId when provided",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedAction({ actionType: "OPEN_CAMERA", connectorId: "sim-conn-1" });
    },
    assert: (r) => r.connectorId === "sim-conn-1",
  },
  {
    id: 34,
    name: "buildSimulatedAction generates sequential IDs",
    run: () => {
      _resetIdsForTests();
      return [
        buildSimulatedAction({ actionType: "A" }).actionId,
        buildSimulatedAction({ actionType: "B" }).actionId,
      ];
    },
    assert: (r) => r[0] === "sim-act-1" && r[1] === "sim-act-2",
  },
  {
    id: 35,
    name: "buildSimulatedAction throws on missing actionType",
    run: () => {
      _resetIdsForTests();
      try {
        buildSimulatedAction({});
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
  {
    id: 36,
    name: "buildSimulatedAction metadata defaults to empty frozen object",
    run: () => {
      _resetIdsForTests();
      const act = buildSimulatedAction({ actionType: "CREATE_TICKET" });
      return { frozen: Object.isFrozen(act.metadata), empty: Object.keys(act.metadata).length === 0 };
    },
    assert: (r) => r.frozen && r.empty,
  },
];