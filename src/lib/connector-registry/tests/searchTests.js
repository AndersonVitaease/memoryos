/**
 * Search Tests (Sprint 30)
 * Includes findByTag and findByType with indexed lookups.
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { createConnectorSearch } from "../connectorSearch.js";
import { _resetIdsForTests } from "../registryContracts.js";

function _setup() {
  _resetIdsForTests();
  const registry = createConnectorRegistry();
  const search = createConnectorSearch(registry);
  return { registry, search };
}

export const SEARCH_TESTS = [
  {
    id: 67,
    name: "findById returns connector",
    run: () => {
      const { registry, search } = _setup();
      const { connector } = registry.register({ connectorName: "C1", vendor: "google" });
      return search.findById(connector.connectorId);
    },
    assert: (r) => r !== null && r.connectorName === "C1",
  },
  {
    id: 68,
    name: "findById returns null for unknown",
    run: () => { const { search } = _setup(); return search.findById("nonexistent"); },
    assert: (r) => r === null,
  },
  {
    id: 69,
    name: "findByVendor returns matching connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", vendor: "google" });
      registry.register({ connectorName: "C2", vendor: "google" });
      registry.register({ connectorName: "C3", vendor: "microsoft" });
      return search.findByVendor("google");
    },
    assert: (r) => r.length === 2 && Object.isFrozen(r),
  },
  {
    id: 70,
    name: "findByVendor returns empty for unknown vendor",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", vendor: "google" });
      return search.findByVendor("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 71,
    name: "findByCategory returns matching connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", category: "email" });
      registry.register({ connectorName: "C2", category: "email" });
      registry.register({ connectorName: "C3", category: "crm" });
      return search.findByCategory("email");
    },
    assert: (r) => r.length === 2,
  },
  {
    id: 72,
    name: "findByCategory returns empty for unknown category",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", category: "email" });
      return search.findByCategory("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 73,
    name: "findByCapability returns matching connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", supportedCapabilities: ["READ", "WRITE"] });
      registry.register({ connectorName: "C2", supportedCapabilities: ["READ"] });
      registry.register({ connectorName: "C3", supportedCapabilities: ["WRITE"] });
      return search.findByCapability("READ");
    },
    assert: (r) => r.length === 2,
  },
  {
    id: 74,
    name: "findByCapability returns empty for unsupported capability",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", supportedCapabilities: ["READ"] });
      return search.findByCapability("DELETE");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 75,
    name: "findByPermission returns matching connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", permissions: ["ALLOW", "DENY"] });
      registry.register({ connectorName: "C2", permissions: ["ALLOW"] });
      registry.register({ connectorName: "C3", permissions: ["DENY"] });
      return search.findByPermission("ALLOW");
    },
    assert: (r) => r.length === 2,
  },
  {
    id: 76,
    name: "findByPermission returns empty for no matches",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", permissions: ["ALLOW"] });
      return search.findByPermission("DENY");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 77,
    name: "findByTag returns matching connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", tags: ["alpha", "beta"] });
      registry.register({ connectorName: "C2", tags: ["alpha"] });
      registry.register({ connectorName: "C3", tags: ["beta"] });
      return search.findByTag("alpha");
    },
    assert: (r) => r.length === 2 && Object.isFrozen(r),
  },
  {
    id: 78,
    name: "findByTag returns empty for unknown tag",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", tags: ["alpha"] });
      return search.findByTag("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 79,
    name: "findByTag returns empty for connectors without tags",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.findByTag("alpha");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 80,
    name: "findByType returns matching connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", connectorType: "INBOUND" });
      registry.register({ connectorName: "C2", connectorType: "INBOUND" });
      registry.register({ connectorName: "C3", connectorType: "OUTBOUND" });
      return search.findByType("INBOUND");
    },
    assert: (r) => r.length === 2 && Object.isFrozen(r),
  },
  {
    id: 81,
    name: "findByType returns empty for unknown type",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", connectorType: "INBOUND" });
      return search.findByType("OUTBOUND");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 82,
    name: "findByType returns BIDIRECTIONAL connectors",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", connectorType: "BIDIRECTIONAL" });
      registry.register({ connectorName: "C2", connectorType: "INBOUND" });
      return search.findByType("BIDIRECTIONAL");
    },
    assert: (r) => r.length === 1,
  },
  {
    id: 83,
    name: "search finds by name",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "GmailConnector", vendor: "google" });
      registry.register({ connectorName: "OutlookConnector", vendor: "microsoft" });
      return search.search("gmail");
    },
    assert: (r) => r.length === 1 && r[0].connectorName === "GmailConnector",
  },
  {
    id: 84,
    name: "search finds by vendor",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", vendor: "google" });
      registry.register({ connectorName: "C2", vendor: "microsoft" });
      return search.search("google");
    },
    assert: (r) => r.length === 1 && r[0].vendor === "google",
  },
  {
    id: 85,
    name: "search finds by description",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", description: "Email integration service" });
      registry.register({ connectorName: "C2", description: "CRM tool" });
      return search.search("email");
    },
    assert: (r) => r.length === 1,
  },
  {
    id: 86,
    name: "search is case insensitive",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "GmailConnector" });
      return search.search("GMAIL");
    },
    assert: (r) => r.length === 1,
  },
  {
    id: 87,
    name: "search returns empty for no matches",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.search("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 88,
    name: "search returns empty for empty query",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.search("");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 89,
    name: "search returns frozen array",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.search("C1");
    },
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 90,
    name: "search object is frozen",
    run: () => { const { search } = _setup(); return Object.isFrozen(search); },
    assert: (r) => r === true,
  },
  {
    id: 91,
    name: "createConnectorSearch throws on missing registry",
    run: () => { try { createConnectorSearch(null); return { threw: false }; } catch (e) { return { threw: true }; } },
    assert: (r) => r.threw,
  },
  {
    id: 92,
    name: "indexed search reflects updates",
    run: () => {
      const { registry, search } = _setup();
      const { connector } = registry.register({ connectorName: "C1", vendor: "google", tags: ["alpha"] });
      registry.update(connector.connectorId, { vendor: "microsoft", tags: ["beta"] });
      return { byGoogle: search.findByVendor("google").length, byMicrosoft: search.findByVendor("microsoft").length, byAlpha: search.findByTag("alpha").length, byBeta: search.findByTag("beta").length };
    },
    assert: (r) => r.byGoogle === 0 && r.byMicrosoft === 1 && r.byAlpha === 0 && r.byBeta === 1,
  },
  {
    id: 93,
    name: "indexed search reflects unregistrations",
    run: () => {
      const { registry, search } = _setup();
      const { connector } = registry.register({ connectorName: "C1", vendor: "google", category: "email" });
      registry.register({ connectorName: "C2", vendor: "google", category: "email" });
      registry.unregister(connector.connectorId);
      return search.findByVendor("google").length;
    },
    assert: (r) => r === 1,
  },
];