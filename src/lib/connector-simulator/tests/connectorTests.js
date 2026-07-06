/**
 * Simulated Connector Tests (Sprint 30)
 */

import { createSimulatedConnector } from "../simulatedConnector.js";
import { buildSimulatedEvent } from "../simulatedEvent.js";
import { buildSimulatedAction } from "../simulatedAction.js";
import { _resetIdsForTests } from "../simulatorContracts.js";

export const CONNECTOR_TESTS = [
  {
    id: 71,
    name: "createSimulatedConnector returns frozen object with manifest",
    run: () => {
      _resetIdsForTests();
      return createSimulatedConnector({ connectorName: "TestConnector" });
    },
    assert: (r) =>
      r.connectorId === "sim-conn-1" &&
      Object.isFrozen(r) &&
      r.manifest.connectorName === "TestConnector" &&
      Object.isFrozen(r.manifest),
  },
  {
    id: 72,
    name: "connect transitions CREATED → CONNECTED",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      const result = conn.connect();
      return { result, state: conn.getState() };
    },
    assert: (r) => r.result.success === true && r.state === "CONNECTED",
  },
  {
    id: 73,
    name: "connect from CONNECTED returns failure",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      return conn.connect();
    },
    assert: (r) => r.success === false && r.state === "CONNECTED",
  },
  {
    id: 74,
    name: "disconnect transitions CONNECTED → DISCONNECTED",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      const result = conn.disconnect();
      return { result, state: conn.getState() };
    },
    assert: (r) => r.result.success === true && r.state === "DISCONNECTED",
  },
  {
    id: 75,
    name: "disconnect from CREATED returns failure",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      return conn.disconnect();
    },
    assert: (r) => r.success === false && r.state === "CREATED",
  },
  {
    id: 76,
    name: "reconnect from DISCONNECTED succeeds",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      conn.disconnect();
      const result = conn.connect();
      return { result, state: conn.getState() };
    },
    assert: (r) => r.result.success === true && r.state === "CONNECTED",
  },
  {
    id: 77,
    name: "publishEvent fails when not connected",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      const evt = buildSimulatedEvent({ eventType: "ORDER_CREATED" });
      return conn.publishEvent(evt);
    },
    assert: (r) => r.accepted === false && r.error.includes("not connected"),
  },
  {
    id: 78,
    name: "publishEvent succeeds when connected",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      const evt = buildSimulatedEvent({ eventType: "ORDER_CREATED" });
      return conn.publishEvent(evt);
    },
    assert: (r) => r.accepted === true && r.eventType === "ORDER_CREATED",
  },
  {
    id: 79,
    name: "receiveAction fails when not connected",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      const act = buildSimulatedAction({ actionType: "SEARCH_CUSTOMER" });
      return conn.receiveAction(act);
    },
    assert: (r) => r.responded === false && r.error.includes("not connected"),
  },
  {
    id: 80,
    name: "receiveAction succeeds and returns response when connected",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      const act = buildSimulatedAction({ actionType: "SEND_EMAIL" });
      const result = conn.receiveAction(act);
      return { result };
    },
    assert: (r) =>
      r.result.responded === true &&
      r.result.response.status === "SUCCESS" &&
      r.result.actionType === "SEND_EMAIL",
  },
  {
    id: 81,
    name: "getEventLog returns published events",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      conn.publishEvent(buildSimulatedEvent({ eventType: "LOGIN" }));
      conn.publishEvent(buildSimulatedEvent({ eventType: "LOGOUT" }));
      return conn.getEventLog();
    },
    assert: (r) => r.length === 2 && Object.isFrozen(r),
  },
  {
    id: 82,
    name: "getActionLog returns received actions",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      conn.connect();
      conn.receiveAction(buildSimulatedAction({ actionType: "CREATE_TICKET" }));
      return conn.getActionLog();
    },
    assert: (r) => r.length === 1 && Object.isFrozen(r),
  },
  {
    id: 83,
    name: "connector with latency config includes latency in results",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1", latency: "SLOW" });
      conn.connect();
      const evt = buildSimulatedEvent({ eventType: "TEST" });
      const pub = conn.publishEvent(evt);
      return { pubLatency: pub.latency };
    },
    assert: (r) => r.pubLatency.latencyMs === 1000 && r.pubLatency.preset === "SLOW",
  },
  {
    id: 84,
    name: "createSimulatedConnector throws on missing name",
    run: () => {
      _resetIdsForTests();
      try {
        createSimulatedConnector({});
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
  {
    id: 85,
    name: "manifest includes supported events and actions",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({
        connectorName: "C1",
        supportedEvents: ["ORDER_CREATED", "PAYMENT_APPROVED"],
        supportedActions: ["SEARCH_CUSTOMER"],
      });
      return conn.manifest;
    },
    assert: (r) =>
      r.supportedEvents.length === 2 && r.supportedActions.length === 1,
  },
  {
    id: 86,
    name: "connect result is frozen",
    run: () => {
      _resetIdsForTests();
      const conn = createSimulatedConnector({ connectorName: "C1" });
      return conn.connect();
    },
    assert: (r) => Object.isFrozen(r),
  },
];