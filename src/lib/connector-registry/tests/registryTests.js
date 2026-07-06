/**
 * Registry Tests (Sprint 30)
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { _resetIdsForTests } from "../registryContracts.js";

export const REGISTRY_TESTS = [
  {
    id: 22,
    name: "register returns success with frozen connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.register({ connectorName: "GmailConnector", vendor: "google" });
    },
    assert: (r) =>
      r.success === true &&
      r.connector.connectorName === "GmailConnector" &&
      Object.isFrozen(r.connector),
  },
  {
    id: 23,
    name: "register generates sequential registration IDs",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const r1 = reg.register({ connectorName: "C1" });
      const r2 = reg.register({ connectorName: "C2" });
      return { id1: r1.connector.registrationId, id2: r2.connector.registrationId };
    },
    assert: (r) => r.id1 === "cre-reg-1" && r.id2 === "cre-reg-2",
  },
  {
    id: 24,
    name: "register returns failure for duplicate connectorId",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register({ connectorName: "C1", connectorId: "fixed-id" });
      return reg.register({ connectorName: "C2", connectorId: "fixed-id" });
    },
    assert: (r) => r.success === false && r.connector === null,
  },
  {
    id: 25,
    name: "register returns failure for missing config",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.register(null);
    },
    assert: (r) => r.success === false,
  },
  {
    id: 26,
    name: "register returns failure for missing connectorName",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.register({ vendor: "google" });
    },
    assert: (r) => r.success === false,
  },
  {
    id: 27,
    name: "unregister removes connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      const result = reg.unregister(connector.connectorId);
      return { result, exists: reg.exists(connector.connectorId) };
    },
    assert: (r) => r.result.success === true && r.exists === false,
  },
  {
    id: 28,
    name: "unregister returns failure for unknown connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.unregister("nonexistent");
    },
    assert: (r) => r.success === false,
  },
  {
    id: 29,
    name: "unregister returns failure for missing connectorId",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.unregister(null);
    },
    assert: (r) => r.success === false,
  },
  {
    id: 30,
    name: "update modifies connector fields",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1", vendor: "old" });
      const result = reg.update(connector.connectorId, { vendor: "new", status: "ACTIVE" });
      return { result };
    },
    assert: (r) =>
      r.result.success === true &&
      r.result.connector.vendor === "new" &&
      r.result.connector.status === "ACTIVE",
  },
  {
    id: 31,
    name: "update preserves registrationId and connectorId",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      const result = reg.update(connector.connectorId, { vendor: "new" });
      return {
        regId: result.connector.registrationId,
        connId: result.connector.connectorId,
        expectedRegId: connector.registrationId,
        expectedConnId: connector.connectorId,
      };
    },
    assert: (r) => r.regId === r.expectedRegId && r.connId === r.expectedConnId,
  },
  {
    id: 32,
    name: "update returns failure for unknown connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.update("nonexistent", { vendor: "new" });
    },
    assert: (r) => r.success === false,
  },
  {
    id: 33,
    name: "update returns frozen connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      const result = reg.update(connector.connectorId, { vendor: "new" });
      return Object.isFrozen(result.connector);
    },
    assert: (r) => r === true,
  },
  {
    id: 34,
    name: "exists returns true for registered connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      return reg.exists(connector.connectorId);
    },
    assert: (r) => r === true,
  },
  {
    id: 35,
    name: "exists returns false for unregistered connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.exists("nonexistent");
    },
    assert: (r) => r === false,
  },
  {
    id: 36,
    name: "reset clears all connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register({ connectorName: "C1" });
      reg.register({ connectorName: "C2" });
      const result = reg.reset();
      return { result, count: reg._count() };
    },
    assert: (r) => r.result.success === true && r.count === 0,
  },
  {
    id: 37,
    name: "registry is frozen",
    run: () => {
      _resetIdsForTests();
      return createConnectorRegistry();
    },
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 38,
    name: "_get returns connector by ID",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      return reg._get(connector.connectorId);
    },
    assert: (r) => r !== null && r.connectorName === "C1",
  },
  {
    id: 39,
    name: "_get returns null for unknown ID",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg._get("nonexistent");
    },
    assert: (r) => r === null,
  },
  {
    id: 40,
    name: "_all returns all registered connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register({ connectorName: "C1" });
      reg.register({ connectorName: "C2" });
      reg.register({ connectorName: "C3" });
      return reg._all();
    },
    assert: (r) => r.length === 3,
  },
  {
    id: 41,
    name: "_count returns number of connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register({ connectorName: "C1" });
      reg.register({ connectorName: "C2" });
      return reg._count();
    },
    assert: (r) => r === 2,
  },
];