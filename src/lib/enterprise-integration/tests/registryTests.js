/**
 * Registry Tests (Sprint 27)
 * register, unregister, exists, get, list, count, reset.
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { buildConnector, _resetIdsForTests } from "../contracts.js";

export const REGISTRY_TESTS = [
  {
    id: 19,
    name: "register stores and returns connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const c = buildConnector({ connectorName: "Sabre" });
      const result = reg.register(c);
      return { result, count: reg.count() };
    },
    assert: ({ result, count }) =>
      result.connectorId === "eil-conn-1" && count === 1,
  },
  {
    id: 20,
    name: "exists returns true for registered connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const c = reg.register(buildConnector({ connectorName: "Amadeus" }));
      return { exists: reg.exists(c.connectorId), notExists: reg.exists("fake") };
    },
    assert: ({ exists, notExists }) => exists === true && notExists === false,
  },
  {
    id: 21,
    name: "get returns connector by ID",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const c = reg.register(buildConnector({ connectorName: "Shopify" }));
      const found = reg.get(c.connectorId);
      return { found };
    },
    assert: ({ found }) =>
      found !== null && found.connectorName === "Shopify",
  },
  {
    id: 22,
    name: "get returns null for unknown ID",
    run: () => {
      const reg = createConnectorRegistry();
      return { result: reg.get("nonexistent") };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 23,
    name: "unregister removes connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const c = reg.register(buildConnector({ connectorName: "Intelbras" }));
      const removed = reg.unregister(c.connectorId);
      return { removed, exists: reg.exists(c.connectorId), count: reg.count() };
    },
    assert: ({ removed, exists, count }) =>
      removed === true && exists === false && count === 0,
  },
  {
    id: 24,
    name: "list returns all connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register(buildConnector({ connectorName: "A" }));
      reg.register(buildConnector({ connectorName: "B" }));
      reg.register(buildConnector({ connectorName: "C", status: "ACTIVE" }));
      return { all: reg.list(), active: reg.list("ACTIVE") };
    },
    assert: ({ all, active }) =>
      all.length === 3 && active.length === 1 && active[0].connectorName === "C",
  },
  {
    id: 25,
    name: "register overwrites existing connector with same ID",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const c1 = reg.register(buildConnector({ connectorName: "A", status: "REGISTERED" }));
      const c2 = reg.register(buildConnector({ connectorId: c1.connectorId, connectorName: "A", status: "ACTIVE" }));
      return { count: reg.count(), stored: reg.get(c1.connectorId) };
    },
    assert: ({ count, stored }) =>
      count === 1 && stored.status === "ACTIVE",
  },
  {
    id: 26,
    name: "reset clears all connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register(buildConnector({ connectorName: "A" }));
      reg.register(buildConnector({ connectorName: "B" }));
      reg.reset();
      return { count: reg.count() };
    },
    assert: ({ count }) => count === 0,
  },
];