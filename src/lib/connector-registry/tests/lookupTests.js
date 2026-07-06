/**
 * Lookup Tests (Sprint 30)
 * Lookup apenas consulta — jamis toma decisões.
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { createConnectorLookup, hasCapability, getCapabilities, listCapabilities, isCapability } from "../connectorLookup.js";
import { createStatistics } from "../statistics.js";
import { _resetIdsForTests } from "../registryContracts.js";

function _setup() {
  _resetIdsForTests();
  const registry = createConnectorRegistry();
  const statistics = createStatistics();
  const lookup = createConnectorLookup({ registry, statistics });
  return { registry, statistics, lookup };
}

export const LOOKUP_TESTS = [
  {
    id: 94,
    name: "getConnector returns found=true for valid ID",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      return lookup.getConnector(connector.connectorId);
    },
    assert: (r) => r.found === true && r.connector.connectorName === "C1" && Object.isFrozen(r),
  },
  {
    id: 95,
    name: "getConnector returns found=false for unknown ID",
    run: () => { const { lookup } = _setup(); return lookup.getConnector("nonexistent"); },
    assert: (r) => r.found === false && r.connector === null && Object.isFrozen(r),
  },
  {
    id: 96,
    name: "getCapability returns found=true and hasCapability=true for supported",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1", supportedCapabilities: ["READ", "WRITE"] });
      return lookup.getCapability(connector.connectorId, "READ");
    },
    assert: (r) => r.found === true && r.hasCapability === true && r.capability === "READ" && Object.isFrozen(r),
  },
  {
    id: 97,
    name: "getCapability returns found=true and hasCapability=false for unsupported",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1", supportedCapabilities: ["READ"] });
      return lookup.getCapability(connector.connectorId, "DELETE");
    },
    assert: (r) => r.found === true && r.hasCapability === false,
  },
  {
    id: 98,
    name: "getCapability returns found=false for unknown connector",
    run: () => { const { lookup } = _setup(); return lookup.getCapability("nonexistent", "READ"); },
    assert: (r) => r.found === false && r.hasCapability === false,
  },
  {
    id: 99,
    name: "getCompatibility returns sdkCompatible for matching SDK",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1", sdkCompatibility: ">=1.0.0", minimumMemoryOSVersion: "1.0.0" });
      return lookup.getCompatibility(connector.connectorId, { sdkVersion: "1.5.0", memoryOSVersion: "1.0.0" });
    },
    assert: (r) => r.found === true && r.sdkCompatible === true && r.memoryOSCompatible === true && Object.isFrozen(r),
  },
  {
    id: 100,
    name: "getCompatibility returns sdkCompatible=false for old SDK",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1", sdkCompatibility: ">=2.0.0" });
      return lookup.getCompatibility(connector.connectorId, { sdkVersion: "1.0.0" });
    },
    assert: (r) => r.found === true && r.sdkCompatible === false,
  },
  {
    id: 101,
    name: "getCompatibility returns memoryOSCompatible=false for old MemoryOS",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1", sdkCompatibility: ">=1.0.0", minimumMemoryOSVersion: "2.0.0" });
      return lookup.getCompatibility(connector.connectorId, { sdkVersion: "1.0.0", memoryOSVersion: "1.0.0" });
    },
    assert: (r) => r.memoryOSCompatible === false,
  },
  {
    id: 102,
    name: "getCompatibility returns found=false for unknown connector",
    run: () => { const { lookup } = _setup(); return lookup.getCompatibility("nonexistent", {}); },
    assert: (r) => r.found === false && r.sdkCompatible === false && r.memoryOSCompatible === false,
  },
  {
    id: 103,
    name: "getCompatibility uses default SDK version when not provided",
    run: () => {
      const { registry, lookup } = _setup();
      const { connector } = registry.register({ connectorName: "C1", sdkCompatibility: ">=1.0.0" });
      return lookup.getCompatibility(connector.connectorId, {});
    },
    assert: (r) => r.found === true && r.sdkCompatible === true,
  },
  {
    id: 104,
    name: "lookup increments connectorQueries statistic",
    run: () => {
      const { registry, lookup, statistics } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      lookup.getConnector(connector.connectorId);
      lookup.getCapability(connector.connectorId, "READ");
      lookup.getCompatibility(connector.connectorId, {});
      return statistics.get("connectorQueries");
    },
    assert: (r) => r === 3,
  },
  {
    id: 105,
    name: "lookup is frozen",
    run: () => { const { lookup } = _setup(); return Object.isFrozen(lookup); },
    assert: (r) => r === true,
  },
  {
    id: 106,
    name: "createConnectorLookup throws on missing registry",
    run: () => { try { createConnectorLookup({}); return { threw: false }; } catch (e) { return { threw: true }; } },
    assert: (r) => r.threw,
  },
  // === Standalone Capability Helpers ===
  {
    id: 107,
    name: "hasCapability returns true for supported capability",
    run: () => hasCapability({ supportedCapabilities: ["READ", "WRITE"] }, "READ"),
    assert: (r) => r === true,
  },
  {
    id: 108,
    name: "hasCapability returns false for unsupported capability",
    run: () => hasCapability({ supportedCapabilities: ["READ"] }, "DELETE"),
    assert: (r) => r === false,
  },
  {
    id: 109,
    name: "hasCapability returns false for null connector",
    run: () => hasCapability(null, "READ"),
    assert: (r) => r === false,
  },
  {
    id: 110,
    name: "getCapabilities returns capabilities array",
    run: () => getCapabilities({ supportedCapabilities: ["READ", "WRITE"] }),
    assert: (r) => r.length === 2 && r.includes("READ") && Object.isFrozen(r),
  },
  {
    id: 111,
    name: "getCapabilities returns empty for null connector",
    run: () => getCapabilities(null),
    assert: (r) => r.length === 0 && Object.isFrozen(r),
  },
  {
    id: 112,
    name: "listCapabilities returns all capabilities",
    run: () => listCapabilities(),
    assert: (r) => r.length === 8 && Object.isFrozen(r),
  },
  {
    id: 113,
    name: "isCapability returns true for valid capability",
    run: () => isCapability("READ"),
    assert: (r) => r === true,
  },
  {
    id: 114,
    name: "isCapability returns false for invalid capability",
    run: () => isCapability("INVALID"),
    assert: (r) => r === false,
  },
];