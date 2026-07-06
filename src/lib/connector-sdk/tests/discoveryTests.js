/**
 * Discovery Tests (Sprint 29)
 */

import { createDiscoveryRegistry } from "../connectorDiscovery.js";
import { buildManifest, _resetIdsForTests } from "../connectorManifest.js";

export const DISCOVERY_TESTS = [
  {
    id: 30,
    name: "discover registers a manifest",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      const m = buildManifest({ connectorName: "Test" });
      return { result: reg.discover(m), size: reg.size() };
    },
    assert: ({ result, size }) => result === true && size === 1,
  },
  {
    id: 31,
    name: "discover rejects duplicate connectorId",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      const m = buildManifest({ connectorName: "Test" });
      reg.discover(m);
      return { result: reg.discover(m), size: reg.size() };
    },
    assert: ({ result, size }) => result === false && size === 1,
  },
  {
    id: 32,
    name: "scan returns all manifests",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      reg.discover(buildManifest({ connectorName: "A" }));
      reg.discover(buildManifest({ connectorName: "B" }));
      const all = reg.scan();
      return { count: all.length, names: all.map((m) => m.connectorName) };
    },
    assert: ({ count, names }) =>
      count === 2 && names[0] === "A" && names[1] === "B",
  },
  {
    id: 33,
    name: "exists returns true for discovered connector",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      const m = buildManifest({ connectorName: "Test" });
      reg.discover(m);
      return { exists: reg.exists(m.connectorId) };
    },
    assert: ({ exists }) => exists === true,
  },
  {
    id: 34,
    name: "exists returns false for unknown connector",
    run: () => {
      const reg = createDiscoveryRegistry();
      return { exists: reg.exists("nonexistent") };
    },
    assert: ({ exists }) => exists === false,
  },
  {
    id: 35,
    name: "list returns all connectorIds",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      reg.discover(buildManifest({ connectorName: "A" }));
      reg.discover(buildManifest({ connectorName: "B" }));
      const ids = reg.list();
      return { ids };
    },
    assert: ({ ids }) => ids.length === 2 && ids[0] === "conn-1" && ids[1] === "conn-2",
  },
  {
    id: 36,
    name: "get returns manifest by connectorId",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      const m = buildManifest({ connectorName: "Test" });
      reg.discover(m);
      const found = reg.get(m.connectorId);
      return { found };
    },
    assert: ({ found }) =>
      found !== null && found.connectorName === "Test",
  },
  {
    id: 37,
    name: "get returns null for unknown connectorId",
    run: () => {
      const reg = createDiscoveryRegistry();
      return { found: reg.get("nonexistent") };
    },
    assert: ({ found }) => found === null,
  },
  {
    id: 38,
    name: "remove deletes a connector",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      const m = buildManifest({ connectorName: "Test" });
      reg.discover(m);
      const removed = reg.remove(m.connectorId);
      return { removed, exists: reg.exists(m.connectorId) };
    },
    assert: ({ removed, exists }) => removed === true && exists === false,
  },
  {
    id: 39,
    name: "reset clears all manifests",
    run: () => {
      _resetIdsForTests();
      const reg = createDiscoveryRegistry();
      reg.discover(buildManifest({ connectorName: "A" }));
      reg.discover(buildManifest({ connectorName: "B" }));
      reg.reset();
      return { size: reg.size() };
    },
    assert: ({ size }) => size === 0,
  },
];