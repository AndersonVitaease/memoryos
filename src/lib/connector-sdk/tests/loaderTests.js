/**
 * Loader Tests (Sprint 29)
 */

import { createConnectorLoader } from "../connectorLoader.js";
import { createDiscoveryRegistry } from "../connectorDiscovery.js";
import { createStatistics } from "../statistics.js";
import { BaseConnector } from "../baseConnector.js";
import { buildManifest, _resetIdsForTests } from "../connectorManifest.js";

export const LOADER_TESTS = [
  {
    id: 40,
    name: "load succeeds for discovered connector",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      const c = new BaseConnector(m);
      const result = loader.load(c);
      return { result, count: loader.loadedCount(), loaded: stats.get("loadedConnectors") };
    },
    assert: ({ result, count, loaded }) =>
      result.ok === true && count === 1 && loaded === 1,
  },
  {
    id: 41,
    name: "load fails for undiscovered connector",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      const c = new BaseConnector(m);
      const result = loader.load(c);
      return { result, errors: stats.get("connectorErrors") };
    },
    assert: ({ result, errors }) =>
      result.ok === false && result.error === "not_discovered" && errors === 1,
  },
  {
    id: 42,
    name: "load fails for already loaded connector",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      const c = new BaseConnector(m);
      loader.load(c);
      const result = loader.load(c);
      return { result, errors: stats.get("connectorErrors") };
    },
    assert: ({ result, errors }) =>
      result.ok === false && result.error === "already_loaded" && errors === 1,
  },
  {
    id: 43,
    name: "unload removes loaded connector",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      const c = new BaseConnector(m);
      loader.load(c);
      const result = loader.unload(m.connectorId);
      return { result, count: loader.loadedCount(), unloaded: stats.get("unloadedConnectors") };
    },
    assert: ({ result, count, unloaded }) =>
      result.ok === true && count === 0 && unloaded === 1,
  },
  {
    id: 44,
    name: "unload fails for not loaded connector",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const result = loader.unload("nonexistent");
      return { result, errors: stats.get("connectorErrors") };
    },
    assert: ({ result, errors }) =>
      result.ok === false && result.error === "not_loaded" && errors === 1,
  },
  {
    id: 45,
    name: "reload unloads and loads again",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      const c = new BaseConnector(m);
      loader.load(c);
      const result = loader.reload(c);
      return { result, isLoaded: loader.isLoaded(m.connectorId) };
    },
    assert: ({ result, isLoaded }) =>
      result.ok === true && isLoaded === true,
  },
  {
    id: 46,
    name: "isLoaded returns correct state",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      const c = new BaseConnector(m);
      const before = loader.isLoaded(m.connectorId);
      loader.load(c);
      const after = loader.isLoaded(m.connectorId);
      return { before, after };
    },
    assert: ({ before, after }) => before === false && after === true,
  },
  {
    id: 47,
    name: "get returns loaded connector",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      const c = new BaseConnector(m);
      loader.load(c);
      const found = loader.get(m.connectorId);
      return { found };
    },
    assert: ({ found }) =>
      found !== null && found.manifest.connectorName === "Test",
  },
  {
    id: 48,
    name: "loadedIds returns all loaded connector IDs",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m1 = buildManifest({ connectorName: "A" });
      const m2 = buildManifest({ connectorName: "B" });
      disc.discover(m1);
      disc.discover(m2);
      loader.load(new BaseConnector(m1));
      loader.load(new BaseConnector(m2));
      return { ids: loader.loadedIds() };
    },
    assert: ({ ids }) => ids.length === 2 && ids.includes("conn-1") && ids.includes("conn-2"),
  },
  {
    id: 49,
    name: "reset clears all loaded connectors",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const m = buildManifest({ connectorName: "Test" });
      disc.discover(m);
      loader.load(new BaseConnector(m));
      loader.reset();
      return { count: loader.loadedCount() };
    },
    assert: ({ count }) => count === 0,
  },
  {
    id: 50,
    name: "load fails for invalid connector (no manifest)",
    run: () => {
      _resetIdsForTests();
      const disc = createDiscoveryRegistry();
      const stats = createStatistics();
      const loader = createConnectorLoader(disc, stats);
      const result = loader.load({ manifest: null });
      return { result, errors: stats.get("connectorErrors") };
    },
    assert: ({ result, errors }) =>
      result.ok === false && result.error === "invalid_connector" && errors === 1,
  },
];