/**
 * Search Tests (Sprint 30)
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
    id: 55,
    name: "findById returns connector",
    run: () => {
      const { registry, search } = _setup();
      const { connector } = registry.register({ connectorName: "C1", vendor: "google" });
      return search.findById(connector.connectorId);
    },
    assert: (r) => r !== null && r.connectorName === "C1",
  },
  {
    id: 56,
    name: "findById returns null for unknown",
    run: () => {
      const { search } = _setup();
      return search.findById("nonexistent");
    },
    assert: (r) => r === null,
  },
  {
    id: 57,
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
    id: 58,
    name: "findByVendor returns empty for unknown vendor",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", vendor: "google" });
      return search.findByVendor("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 59,
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
    id: 60,
    name: "findByCategory returns empty for unknown category",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", category: "email" });
      return search.findByCategory("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 61,
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
    id: 62,
    name: "findByCapability returns empty for unsupported capability",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", supportedCapabilities: ["READ"] });
      return search.findByCapability("DELETE");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 63,
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
    id: 64,
    name: "findByPermission returns empty for no matches",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", permissions: ["ALLOW"] });
      return search.findByPermission("DENY");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 65,
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
    id: 66,
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
    id: 67,
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
    id: 68,
    name: "search finds by category",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1", category: "email" });
      registry.register({ connectorName: "C2", category: "crm" });
      return search.search("email");
    },
    assert: (r) => r.length === 1,
  },
  {
    id: 69,
    name: "search is case insensitive",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "GmailConnector" });
      return search.search("GMAIL");
    },
    assert: (r) => r.length === 1,
  },
  {
    id: 70,
    name: "search returns empty for no matches",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.search("nonexistent");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 71,
    name: "search returns empty for empty query",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.search("");
    },
    assert: (r) => r.length === 0,
  },
  {
    id: 72,
    name: "search returns frozen array",
    run: () => {
      const { registry, search } = _setup();
      registry.register({ connectorName: "C1" });
      return search.search("C1");
    },
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 73,
    name: "search object is frozen",
    run: () => {
      const { search } = _setup();
      return Object.isFrozen(search);
    },
    assert: (r) => r === true,
  },
  {
    id: 74,
    name: "createConnectorSearch throws on missing registry",
    run: () => {
      try {
        createConnectorSearch(null);
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
];