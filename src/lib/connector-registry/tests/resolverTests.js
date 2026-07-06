/**
 * Resolver Tests (Sprint 30)
 */

import { createConnectorRegistry } from "../connectorRegistry.js";
import { createConnectorResolver } from "../connectorResolver.js";
import { createStatistics } from "../statistics.js";
import { _resetIdsForTests } from "../registryContracts.js";

function _setup() {
  _resetIdsForTests();
  const registry = createConnectorRegistry();
  const statistics = createStatistics();
  const resolver = createConnectorResolver({ registry, statistics });
  return { registry, statistics, resolver };
}

export const RESOLVER_TESTS = [
  {
    id: 75,
    name: "resolveConnector returns connector with resolved flag",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      return resolver.resolveConnector(connector.connectorId);
    },
    assert: (r) =>
      r !== null &&
      r.resolved === true &&
      r.connectorName === "C1" &&
      Object.isFrozen(r),
  },
  {
    id: 76,
    name: "resolveConnector returns null for unknown",
    run: () => {
      const { resolver } = _setup();
      return resolver.resolveConnector("nonexistent");
    },
    assert: (r) => r === null,
  },
  {
    id: 77,
    name: "resolveCapability returns true for supported capability",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({
        connectorName: "C1",
        supportedCapabilities: ["READ", "WRITE"],
      });
      return resolver.resolveCapability(connector.connectorId, "READ");
    },
    assert: (r) =>
      r.resolved === true &&
      r.hasCapability === true &&
      r.capability === "READ" &&
      Object.isFrozen(r),
  },
  {
    id: 78,
    name: "resolveCapability returns false for unsupported capability",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({
        connectorName: "C1",
        supportedCapabilities: ["READ"],
      });
      return resolver.resolveCapability(connector.connectorId, "DELETE");
    },
    assert: (r) => r.resolved === true && r.hasCapability === false,
  },
  {
    id: 79,
    name: "resolveCapability returns resolved false for unknown connector",
    run: () => {
      const { resolver } = _setup();
      return resolver.resolveCapability("nonexistent", "READ");
    },
    assert: (r) => r.resolved === false && r.hasCapability === false,
  },
  {
    id: 80,
    name: "resolveCompatibility returns compatible for matching SDK",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({
        connectorName: "C1",
        sdkCompatibility: ">=1.0.0",
        minimumMemoryOSVersion: "1.0.0",
      });
      return resolver.resolveCompatibility(connector.connectorId, { sdkVersion: "1.5.0", memoryOSVersion: "1.0.0" });
    },
    assert: (r) =>
      r.resolved === true &&
      r.compatible === true &&
      r.sdkCompatible === true &&
      r.memoryOSCompatible === true &&
      Object.isFrozen(r),
  },
  {
    id: 81,
    name: "resolveCompatibility returns incompatible for old SDK",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({
        connectorName: "C1",
        sdkCompatibility: ">=2.0.0",
      });
      return resolver.resolveCompatibility(connector.connectorId, { sdkVersion: "1.0.0" });
    },
    assert: (r) => r.resolved === true && r.compatible === false && r.sdkCompatible === false,
  },
  {
    id: 82,
    name: "resolveCompatibility returns incompatible for old MemoryOS",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({
        connectorName: "C1",
        sdkCompatibility: ">=1.0.0",
        minimumMemoryOSVersion: "2.0.0",
      });
      return resolver.resolveCompatibility(connector.connectorId, { sdkVersion: "1.0.0", memoryOSVersion: "1.0.0" });
    },
    assert: (r) => r.compatible === false && r.memoryOSCompatible === false,
  },
  {
    id: 83,
    name: "resolveCompatibility returns resolved false for unknown connector",
    run: () => {
      const { resolver } = _setup();
      return resolver.resolveCompatibility("nonexistent", {});
    },
    assert: (r) => r.resolved === false && r.compatible === false,
  },
  {
    id: 84,
    name: "resolveCompatibility uses default SDK version when not provided",
    run: () => {
      const { registry, resolver } = _setup();
      const { connector } = registry.register({
        connectorName: "C1",
        sdkCompatibility: ">=1.0.0",
      });
      return resolver.resolveCompatibility(connector.connectorId, {});
    },
    assert: (r) => r.resolved === true && r.sdkCompatible === true,
  },
  {
    id: 85,
    name: "resolver increments connectorQueries statistic",
    run: () => {
      const { registry, resolver, statistics } = _setup();
      const { connector } = registry.register({ connectorName: "C1" });
      resolver.resolveConnector(connector.connectorId);
      resolver.resolveCapability(connector.connectorId, "READ");
      return statistics.get("connectorQueries");
    },
    assert: (r) => r === 2,
  },
  {
    id: 86,
    name: "resolver is frozen",
    run: () => {
      const { resolver } = _setup();
      return Object.isFrozen(resolver);
    },
    assert: (r) => r === true,
  },
  {
    id: 87,
    name: "createConnectorResolver throws on missing registry",
    run: () => {
      try {
        createConnectorResolver({});
        return { threw: false };
      } catch (e) {
        return { threw: true };
      }
    },
    assert: (r) => r.threw,
  },
];