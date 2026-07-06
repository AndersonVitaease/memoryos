/**
 * Simulated Event Tests (Sprint 30)
 */

import { buildSimulatedEvent } from "../simulatedEvent.js";
import { _resetIdsForTests, PRIORITIES } from "../simulatorContracts.js";

export const EVENT_TESTS = [
  {
    id: 21,
    name: "buildSimulatedEvent creates event with required fields",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedEvent({ eventType: "ORDER_CREATED" });
    },
    assert: (r) =>
      r.eventId === "sim-evt-1" &&
      r.eventType === "ORDER_CREATED" &&
      r.eventVersion === "1.0.0" &&
      r.priority === "NORMAL" &&
      r.status === "CREATED" &&
      typeof r.timestamp === "string" &&
      Object.isFrozen(r),
  },
  {
    id: 22,
    name: "buildSimulatedEvent accepts custom priority",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedEvent({ eventType: "LOGIN", priority: "CRITICAL" });
    },
    assert: (r) => r.priority === "CRITICAL",
  },
  {
    id: 23,
    name: "buildSimulatedEvent defaults invalid priority to NORMAL",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedEvent({ eventType: "LOGOUT", priority: "INVALID" });
    },
    assert: (r) => r.priority === "NORMAL",
  },
  {
    id: 24,
    name: "buildSimulatedEvent deep-freezes payload",
    run: () => {
      _resetIdsForTests();
      const evt = buildSimulatedEvent({
        eventType: "PAYMENT_APPROVED",
        payload: { amount: 100, items: [1, 2] },
      });
      return {
        payloadFrozen: Object.isFrozen(evt.payload),
        itemsFrozen: Object.isFrozen(evt.payload.items),
      };
    },
    assert: (r) => r.payloadFrozen && r.itemsFrozen,
  },
  {
    id: 25,
    name: "buildSimulatedEvent deep-freezes metadata",
    run: () => {
      _resetIdsForTests();
      const evt = buildSimulatedEvent({
        eventType: "EMAIL_RECEIVED",
        metadata: { source: "test" },
      });
      return { metaFrozen: Object.isFrozen(evt.metadata) };
    },
    assert: (r) => r.metaFrozen,
  },
  {
    id: 26,
    name: "buildSimulatedEvent supports all UEB priorities",
    run: () => {
      _resetIdsForTests();
      return PRIORITIES.map((p) => buildSimulatedEvent({ eventType: "TEST", priority: p }).priority);
    },
    assert: (r) => r.every((p, i) => p === PRIORITIES[i]),
  },
  {
    id: 27,
    name: "buildSimulatedEvent throws on missing eventType",
    run: () => {
      _resetIdsForTests();
      try {
        buildSimulatedEvent({});
        return { threw: false };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    },
    assert: (r) => r.threw === true,
  },
  {
    id: 28,
    name: "buildSimulatedEvent generates sequential IDs",
    run: () => {
      _resetIdsForTests();
      return [
        buildSimulatedEvent({ eventType: "A" }).eventId,
        buildSimulatedEvent({ eventType: "B" }).eventId,
      ];
    },
    assert: (r) => r[0] === "sim-evt-1" && r[1] === "sim-evt-2",
  },
  {
    id: 29,
    name: "buildSimulatedEvent includes connectorId when provided",
    run: () => {
      _resetIdsForTests();
      return buildSimulatedEvent({ eventType: "CAMERA_ALERT", connectorId: "sim-conn-1" });
    },
    assert: (r) => r.connectorId === "sim-conn-1",
  },
  {
    id: 30,
    name: "buildSimulatedEvent payload defaults to empty frozen object",
    run: () => {
      _resetIdsForTests();
      const evt = buildSimulatedEvent({ eventType: "TEST" });
      return { payload: evt.payload, frozen: Object.isFrozen(evt.payload) };
    },
    assert: (r) => r.frozen && Object.keys(r.payload).length === 0,
  },
];