/**
 * Registry Tests (Sprint 30)
 * Includes batch registration and unregisterBatch.
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { createStatistics } from "../statistics.js";
import { _resetIdsForTests } from "../registryContracts.js";

export const REGISTRY_TESTS = [
  {
    id: 23,
    name: "register returns success with frozen connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.register({ connectorName: "GmailConnector", vendor: "google" });
    },
    assert: (r) => r.success === true && r.connector.connectorName === "GmailConnector" && Object.isFrozen(r.connector),
  },
  {
    id: 24,
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
    id: 25,
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
    id: 26,
    name: "register returns failure for missing config",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.register(null); },
    assert: (r) => r.success === false,
  },
  {
    id: 27,
    name: "register returns failure for missing connectorName",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.register({ vendor: "google" }); },
    assert: (r) => r.success === false,
  },
  {
    id: 28,
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
    id: 29,
    name: "unregister returns failure for unknown connector",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.unregister("nonexistent"); },
    assert: (r) => r.success === false,
  },
  {
    id: 30,
    name: "unregister returns failure for missing connectorId",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.unregister(null); },
    assert: (r) => r.success === false,
  },
  {
    id: 31,
    name: "update modifies connector fields",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1", vendor: "old" });
      return reg.update(connector.connectorId, { vendor: "new", status: "ACTIVE" });
    },
    assert: (r) => r.success === true && r.connector.vendor === "new" && r.connector.status === "ACTIVE",
  },
  {
    id: 32,
    name: "update preserves registrationId and connectorId",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      const result = reg.update(connector.connectorId, { vendor: "new" });
      return { regId: result.connector.registrationId, connId: result.connector.connectorId, expectedRegId: connector.registrationId, expectedConnId: connector.connectorId };
    },
    assert: (r) => r.regId === r.expectedRegId && r.connId === r.expectedConnId,
  },
  {
    id: 33,
    name: "update returns failure for unknown connector",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.update("nonexistent", { vendor: "new" }); },
    assert: (r) => r.success === false,
  },
  {
    id: 34,
    name: "update returns frozen connector",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const { connector } = reg.register({ connectorName: "C1" });
      return Object.isFrozen(reg.update(connector.connectorId, { vendor: "new" }).connector);
    },
    assert: (r) => r === true,
  },
  {
    id: 35,
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
    id: 36,
    name: "exists returns false for unregistered connector",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.exists("nonexistent"); },
    assert: (r) => r === false,
  },
  {
    id: 37,
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
    id: 38,
    name: "registry is frozen",
    run: () => { _resetIdsForTests(); return createConnectorRegistry(); },
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 39,
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
    id: 40,
    name: "_get returns null for unknown ID",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg._get("nonexistent"); },
    assert: (r) => r === null,
  },
  {
    id: 41,
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
    id: 42,
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
  // === Batch Registration ===
  {
    id: 43,
    name: "registerBatch registers multiple connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      return reg.registerBatch([
        { connectorName: "C1" },
        { connectorName: "C2" },
        { connectorName: "C3" },
      ]);
    },
    assert: (r) => r.success === true && r.successCount === 3 && r.failureCount === 0 && r.results.length === 3,
  },
  {
    id: 44,
    name: "registerBatch returns failure for non-array input",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.registerBatch(null); },
    assert: (r) => r.success === false && r.results.length === 0,
  },
  {
    id: 45,
    name: "registerBatch handles partial failures (duplicate IDs)",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      reg.register({ connectorName: "Existing", connectorId: "dup-id" });
      return reg.registerBatch([
        { connectorName: "C1", connectorId: "new-id-1" },
        { connectorName: "Dup", connectorId: "dup-id" },
        { connectorName: "C3", connectorId: "new-id-3" },
      ]);
    },
    assert: (r) => r.success === false && r.successCount === 2 && r.failureCount === 1,
  },
  {
    id: 46,
    name: "registerBatch with empty array succeeds with 0 results",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.registerBatch([]); },
    assert: (r) => r.success === true && r.successCount === 0 && r.failureCount === 0,
  },
  {
    id: 47,
    name: "registerBatch results contain connector objects",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const result = reg.registerBatch([{ connectorName: "C1" }]);
      return result.results[0];
    },
    assert: (r) => r.success === true && r.connector.connectorName === "C1",
  },
  {
    id: 48,
    name: "unregisterBatch removes multiple connectors",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const r1 = reg.register({ connectorName: "C1" });
      const r2 = reg.register({ connectorName: "C2" });
      const result = reg.unregisterBatch([r1.connector.connectorId, r2.connector.connectorId]);
      return { result, count: reg._count() };
    },
    assert: (r) => r.result.success === true && r.result.successCount === 2 && r.count === 0,
  },
  {
    id: 49,
    name: "unregisterBatch handles partial failures",
    run: () => {
      _resetIdsForTests();
      const reg = createConnectorRegistry();
      const r1 = reg.register({ connectorName: "C1" });
      const result = reg.unregisterBatch([r1.connector.connectorId, "nonexistent"]);
      return result;
    },
    assert: (r) => r.success === false && r.successCount === 1 && r.failureCount === 1,
  },
  {
    id: 50,
    name: "unregisterBatch returns failure for non-array input",
    run: () => { _resetIdsForTests(); const reg = createConnectorRegistry(); return reg.unregisterBatch(null); },
    assert: (r) => r.success === false,
  },
  {
    id: 51,
    name: "register updates statistics when statistics provided",
    run: () => {
      _resetIdsForTests();
      const stats = createStatistics();
      const reg = createConnectorRegistry(stats);
      reg.register({ connectorName: "C1", category: "email", connectorType: "INBOUND" });
      reg.register({ connectorName: "C2", category: "crm", connectorType: "OUTBOUND" });
      return stats.snapshot();
    },
    assert: (r) => r.registeredConnectors === 2 && r.registeredByCategory.email === 1 && r.registeredByCategory.crm === 1 && r.registeredByType.INBOUND === 1 && r.registeredByType.OUTBOUND === 1,
  },
  {
    id: 52,
    name: "unregister updates statistics when statistics provided",
    run: () => {
      _resetIdsForTests();
      const stats = createStatistics();
      const reg = createConnectorRegistry(stats);
      const { connector } = reg.register({ connectorName: "C1", category: "email" });
      reg.unregister(connector.connectorId);
      return stats.snapshot();
    },
    assert: (r) => r.registeredConnectors === 0 && r.registeredByCategory.email === undefined,
  },
  {
    id: 53,
    name: "update adjusts statistics when status changes",
    run: () => {
      _resetIdsForTests();
      const stats = createStatistics();
      const reg = createConnectorRegistry(stats);
      const { connector } = reg.register({ connectorName: "C1", status: "REGISTERED" });
      reg.update(connector.connectorId, { status: "ACTIVE" });
      return stats.get("activeConnectors");
    },
    assert: (r) => r === 1,
  },
];