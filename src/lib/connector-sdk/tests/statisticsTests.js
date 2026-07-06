/**
 * Statistics Tests (Sprint 29)
 */

import { createStatistics } from "../statistics.js";

export const STATISTICS_TESTS = [
  {
    id: 118,
    name: "inc increments counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("loadedConnectors");
      stats.inc("loadedConnectors");
      stats.inc("connectorErrors");
      return {
        loaded: stats.get("loadedConnectors"),
        errors: stats.get("connectorErrors"),
      };
    },
    assert: ({ loaded, errors }) => loaded === 2 && errors === 1,
  },
  {
    id: 119,
    name: "dec decrements counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("lifecycleTransitions", 10);
      stats.dec("lifecycleTransitions", 3);
      return { transitions: stats.get("lifecycleTransitions") };
    },
    assert: ({ transitions }) => transitions === 7,
  },
  {
    id: 120,
    name: "get returns 0 for unknown key",
    run: () => {
      const stats = createStatistics();
      return { val: stats.get("nonexistent") };
    },
    assert: ({ val }) => val === 0,
  },
  {
    id: 121,
    name: "snapshot returns all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("loadedConnectors", 5);
      stats.inc("unloadedConnectors", 2);
      stats.inc("connectorErrors", 1);
      stats.inc("lifecycleTransitions", 10);
      return { snap: stats.snapshot() };
    },
    assert: ({ snap }) =>
      snap.loadedConnectors === 5 &&
      snap.unloadedConnectors === 2 &&
      snap.connectorErrors === 1 &&
      snap.lifecycleTransitions === 10,
  },
  {
    id: 122,
    name: "resetStatistics zeroes all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("loadedConnectors", 10);
      stats.inc("connectorErrors", 5);
      stats.resetStatistics();
      return { snap: stats.snapshot() };
    },
    assert: ({ snap }) =>
      snap.loadedConnectors === 0 &&
      snap.unloadedConnectors === 0 &&
      snap.connectorErrors === 0 &&
      snap.lifecycleTransitions === 0,
  },
  {
    id: 123,
    name: "describeStatistics returns readable string",
    run: () => {
      const stats = createStatistics();
      stats.inc("loadedConnectors", 3);
      stats.inc("lifecycleTransitions", 7);
      const desc = stats.describeStatistics();
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" &&
      desc.includes("Connector SDK") &&
      desc.includes("Loaded Connectors: 3") &&
      desc.includes("Lifecycle Transitions: 7"),
  },
  {
    id: 124,
    name: "snapshot returns a copy (not mutable reference)",
    run: () => {
      const stats = createStatistics();
      stats.inc("loadedConnectors", 1);
      const snap1 = stats.snapshot();
      stats.inc("loadedConnectors", 1);
      const snap2 = stats.snapshot();
      return { snap1, snap2 };
    },
    assert: ({ snap1, snap2 }) =>
      snap1.loadedConnectors === 1 && snap2.loadedConnectors === 2,
  },
  {
    id: 125,
    name: "createStatistics returns frozen object",
    run: () => {
      const stats = createStatistics();
      return { frozen: Object.isFrozen(stats) };
    },
    assert: ({ frozen }) => frozen === true,
  },
];