/**
 * Integration Engine Tests (Sprint 27)
 * Full flow through createIntegrationEngine.
 */

import { createIntegrationEngine } from "../integrationEngine.js";
import { _resetIdsForTests } from "../contracts.js";

export const INTEGRATION_TESTS = [
  {
    id: 103,
    name: "registerConnector creates and stores connector with stats",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      const c = engine.registerConnector({
        connectorName: "Sabre",
        vendor: "Sabre Corp",
        status: "ACTIVE",
        supportedActions: ["SEARCH_BOOKING", "BOOK_FLIGHT"],
      });
      const stats = engine.getStats();
      return { c, stats };
    },
    assert: ({ c, stats }) =>
      c.connectorId === "eil-conn-1" &&
      stats.registeredConnectors === 1 &&
      stats.activeConnectors === 1,
  },
  {
    id: 104,
    name: "setConnectorStatus updates stats correctly",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      const c = engine.registerConnector({ connectorName: "X", status: "ACTIVE" });
      engine.setConnectorStatus(c.connectorId, "DISABLED");
      return { stats: engine.getStats() };
    },
    assert: ({ stats }) =>
      stats.activeConnectors === 0 && stats.disabledConnectors === 1,
  },
  {
    id: 105,
    name: "receiveEvent flows through engine to dispatcher",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      const event = engine.receiveEvent({ eventType: "CALL_RECEIVED" });
      return { event, stats: engine.getStats() };
    },
    assert: ({ event, stats }) =>
      event.eventId === "eil-evt-1" && stats.dispatchedEvents === 1,
  },
  {
    id: 106,
    name: "requestAction approved through engine",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      engine.registerConnector({
        connectorName: "Phone",
        status: "ACTIVE",
        supportedActions: ["SEARCH_CUSTOMER"],
      });
      const result = engine.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: "eil-conn-1",
      });
      return { result, stats: engine.getStats() };
    },
    assert: ({ result, stats }) =>
      result.status === "APPROVED" && stats.dispatchedActions === 1,
  },
  {
    id: 107,
    name: "requestAction rejected for inactive connector through engine",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      engine.registerConnector({
        connectorName: "Phone",
        status: "PAUSED",
        supportedActions: ["SEARCH_CUSTOMER"],
      });
      const result = engine.requestAction({
        actionType: "SEARCH_CUSTOMER",
        connectorId: "eil-conn-1",
      });
      return { result, stats: engine.getStats() };
    },
    assert: ({ result, stats }) =>
      result.status === "REJECTED" && stats.failedActions === 1,
  },
  {
    id: 108,
    name: "permission grant + action request with ALLOW through engine",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      engine.registerConnector({
        connectorName: "CRM",
        status: "ACTIVE",
        supportedActions: ["CREATE_TICKET"],
      });
      engine.permissionManager.grant({
        scope: "user",
        scopeId: "u1",
        connectorId: "eil-conn-1",
        type: "ALLOW",
      });
      const result = engine.requestAction({
        actionType: "CREATE_TICKET",
        connectorId: "eil-conn-1",
        permissionScope: "user",
        permissionScopeId: "u1",
      });
      return { result, stats: engine.getStats() };
    },
    assert: ({ result, stats }) =>
      result.status === "APPROVED" && stats.permissionChecks === 1,
  },
  {
    id: 109,
    name: "describe returns readable status string",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      engine.registerConnector({ connectorName: "A", status: "ACTIVE" });
      engine.receiveEvent({ eventType: "LOGIN" });
      const desc = engine.describe();
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" &&
      desc.includes("Enterprise Integration Layer") &&
      desc.includes("Registered Connectors: 1"),
  },
  {
    id: 110,
    name: "reset clears all engine state",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      engine.registerConnector({ connectorName: "A", status: "ACTIVE" });
      engine.receiveEvent({ eventType: "LOGIN" });
      engine.permissionManager.grant({
        scope: "user",
        scopeId: "u1",
        connectorId: "c1",
        type: "ALLOW",
      });
      engine.reset();
      return {
        stats: engine.getStats(),
        connectorCount: engine.registry.count(),
        permCount: engine.permissionManager.count(),
      };
    },
    assert: ({ stats, connectorCount, permCount }) =>
      stats.registeredConnectors === 0 &&
      connectorCount === 0 &&
      permCount === 0,
  },
  {
    id: 111,
    name: "unregisterConnector decrements stats",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      const c = engine.registerConnector({ connectorName: "A", status: "ACTIVE" });
      engine.unregisterConnector(c.connectorId);
      return { stats: engine.getStats(), count: engine.registry.count() };
    },
    assert: ({ stats, count }) =>
      stats.registeredConnectors === 0 &&
      stats.activeConnectors === 0 &&
      count === 0,
  },
  {
    id: 112,
    name: "full flow: register → event → subscribe → dispatch → ack",
    run: () => {
      _resetIdsForTests();
      const engine = createIntegrationEngine();
      engine.registerConnector({ connectorName: "Phone", status: "ACTIVE" });
      engine.eventDispatcher.subscribe("svc", "CALL_RECEIVED");
      const event = engine.receiveEvent({ eventType: "CALL_RECEIVED" });
      const dispatched = engine.eventDispatcher.dispatch();
      const acked = engine.eventDispatcher.ack(event.eventId);
      return { event, dispatched, acked, stats: engine.getStats() };
    },
    assert: ({ event, dispatched, acked, stats }) =>
      event.eventId === "eil-evt-1" &&
      dispatched.subscribers.includes("svc") &&
      acked === true &&
      stats.dispatchedEvents === 1,
  },
];