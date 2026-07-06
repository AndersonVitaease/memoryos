/**
 * Catalog Tests (Sprint 30)
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { createConnectorCatalog } from "../connectorCatalog.js";
import { _resetIdsForTests } from "../registryContracts.js";

function _setup() {
  _resetIdsForTests();
  const registry = createConnectorRegistry();
  const catalog = createConnectorCatalog(registry);
  return { registry, catalog };
}

export const CATALOG_TESTS = [
  {
    id: 54,
    name: "list returns empty array when no connectors",
    run: () => { const { catalog } = _setup(); return catalog.list(); },
    assert: (r) => r.length === 0 && Object.isFrozen(r),
  },
  {
    id: 55,
    name: "list returns all registered connectors",
    run: () => {
      const { registry, catalog } = _setup();
      registry.register({ connectorName: "C1" });
      registry.register({ connectorName: "C2" });
      return catalog.list();
    },
    assert: (r) => r.length === 2 && Object.isFrozen(r),
  },
  {
    id: 56,
    name: "count returns 0 for empty registry",
    run: () => { const { catalog } = _setup(); return catalog.count(); },
    assert: (r) => r === 0,
  },
  {
    id: 57,
    name: "count returns correct number",
    run: () => {
      const { registry, catalog } = _setup();
      registry.register({ connectorName: "C1" });
      registry.register({ connectorName: "C2" });
      registry.register({ connectorName: "C3" });
      return catalog.count();
    },
    assert: (r) => r === 3,
  },
  {
    id: 58,
    name: "get returns connector by ID",
    run: () => {
      const { registry, catalog } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      return catalog.get(connector.connectorId);
    },
    assert: (r) => r !== null && r.connectorName === "C1",
  },
  {
    id: 59,
    name: "get returns null for unknown ID",
    run: () => { const { catalog } = _setup(); return catalog.get("nonexistent"); },
    assert: (r) => r === null,
  },
  {
    id: 60,
    name: "describe returns readable string",
    run: () => {
      const { registry, catalog } = _setup();
      registry.register({ connectorName: "GmailConnector", vendor: "google", status: "ACTIVE" });
      return catalog.describe();
    },
    assert: (r) => typeof r === "string" && r.includes("Connector Registry") && r.includes("Total Connectors: 1") && r.includes("GmailConnector"),
  },
  {
    id: 61,
    name: "describe shows empty catalog correctly",
    run: () => { const { catalog } = _setup(); return catalog.describe(); },
    assert: (r) => typeof r === "string" && r.includes("Total Connectors: 0"),
  },
  {
    id: 62,
    name: "describe includes status breakdown",
    run: () => {
      const { registry, catalog } = _setup();
      registry.register({ connectorName: "C1", status: "ACTIVE" });
      registry.register({ connectorName: "C2", status: "INACTIVE" });
      return catalog.describe();
    },
    assert: (r) => r.includes("ACTIVE: 1") && r.includes("INACTIVE: 1"),
  },
  {
    id: 63,
    name: "catalog is frozen",
    run: () => { const { catalog } = _setup(); return Object.isFrozen(catalog); },
    assert: (r) => r === true,
  },
  {
    id: 64,
    name: "list reflects updates",
    run: () => {
      const { registry, catalog } = _setup();
      const { connector } = registry.register({ connectorName: "C1", vendor: "old" });
      registry.update(connector.connectorId, { vendor: "new" });
      return catalog.list()[0].vendor;
    },
    assert: (r) => r === "new",
  },
  {
    id: 65,
    name: "list reflects unregistrations",
    run: () => {
      const { registry, catalog } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      registry.register({ connectorName: "C2" });
      registry.unregister(connector.connectorId);
      return catalog.count();
    },
    assert: (r) => r === 1,
  },
  {
    id: 66,
    name: "createConnectorCatalog throws on missing registry",
    run: () => { try { createConnectorCatalog(null); return { threw: false }; } catch (e) { return { threw: true }; } },
    assert: (r) => r.threw,
  },
];