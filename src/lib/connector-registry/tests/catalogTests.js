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
    id: 42,
    name: "list returns empty array when no connectors",
    run: () => {
      const { catalog } = _setup();
      return catalog.list();
    },
    assert: (r) => r.length === 0 && Object.isFrozen(r),
  },
  {
    id: 43,
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
    id: 44,
    name: "count returns 0 for empty registry",
    run: () => {
      const { catalog } = _setup();
      return catalog.count();
    },
    assert: (r) => r === 0,
  },
  {
    id: 45,
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
    id: 46,
    name: "get returns connector by ID",
    run: () => {
      const { registry, catalog } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      return catalog.get(connector.connectorId);
    },
    assert: (r) => r !== null && r.connectorName === "C1",
  },
  {
    id: 47,
    name: "get returns null for unknown ID",
    run: () => {
      const { catalog } = _setup();
      return catalog.get("nonexistent");
    },
    assert: (r) => r === null,
  },
  {
    id: 48,
    name: "describe returns readable string",
    run: () => {
      const { registry, catalog } = _setup();
      registry.register({ connectorName: "GmailConnector", vendor: "google", status: "ACTIVE" });
      const desc = catalog.describe();
      return { desc };
    },
    assert: (r) =>
      typeof r.desc === "string" &&
      r.desc.includes("Connector Registry") &&
      r.desc.includes("Total Connectors: 1") &&
      r.desc.includes("GmailConnector"),
  },
  {
    id: 49,
    name: "describe shows empty catalog correctly",
    run: () => {
      const { catalog } = _setup();
      return catalog.describe();
    },
    assert: (r) => typeof r === "string" && r.includes("Total Connectors: 0"),
  },
  {
    id: 50,
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
    id: 51,
    name: "catalog is frozen",
    run: () => {
      const { catalog } = _setup();
      return Object.isFrozen(catalog);
    },
    assert: (r) => r === true,
  },
  {
    id: 52,
    name: "list reflects updates",
    run: () => {
      const { registry, catalog } = _setup();
      const { connector } = registry.register({ connectorName: "C1", vendor: "old" });
      registry.update(connector.connectorId, { vendor: "new" });
      const list = catalog.list();
      return list[0].vendor;
    },
    assert: (r) => r === "new",
  },
  {
    id: 53,
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
    id: 54,
    name: "createConnectorCatalog throws on missing registry",
    run: () => {
      try {
        createConnectorCatalog(null);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
];