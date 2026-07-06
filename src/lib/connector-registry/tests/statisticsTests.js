/**
 * Statistics Tests (Sprint 30)
 */

import { createStatistics } from "../statistics.js";

export const STATISTICS_TESTS = [
  {
    id: 146,
    name: "createStatistics returns frozen object",
    run: () => createStatistics(),
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 147,
    name: "inc increments registeredConnectors",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors");
      stats.inc("registeredConnectors");
      return stats.get("registeredConnectors");
    },
    assert: (r) => r === 2,
  },
  {
    id: 148,
    name: "inc increments activeConnectors",
    run: () => {
      const stats = createStatistics();
      stats.inc("activeConnectors", 5);
      return stats.get("activeConnectors");
    },
    assert: (r) => r === 5,
  },
  {
    id: 149,
    name: "inc increments compatibleConnectors",
    run: () => {
      const stats = createStatistics();
      stats.inc("compatibleConnectors", 3);
      return stats.get("compatibleConnectors");
    },
    assert: (r) => r === 3,
  },
  {
    id: 150,
    name: "inc increments incompatibleConnectors",
    run: () => {
      const stats = createStatistics();
      stats.inc("incompatibleConnectors", 2);
      return stats.get("incompatibleConnectors");
    },
    assert: (r) => r === 2,
  },
  {
    id: 151,
    name: "inc increments connectorQueries",
    run: () => {
      const stats = createStatistics();
      stats.inc("connectorQueries", 10);
      return stats.get("connectorQueries");
    },
    assert: (r) => r === 10,
  },
  {
    id: 152,
    name: "dec decrements counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 10);
      stats.dec("registeredConnectors", 3);
      return stats.get("registeredConnectors");
    },
    assert: (r) => r === 7,
  },
  {
    id: 153,
    name: "get returns 0 for unknown key",
    run: () => {
      const stats = createStatistics();
      return stats.get("nonexistent");
    },
    assert: (r) => r === 0,
  },
  {
    id: 154,
    name: "inc on unknown key does nothing",
    run: () => {
      const stats = createStatistics();
      stats.inc("unknownKey", 5);
      return stats.get("unknownKey");
    },
    assert: (r) => r === 0,
  },
  {
    id: 155,
    name: "snapshot returns all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 3);
      stats.inc("activeConnectors", 2);
      stats.inc("compatibleConnectors", 1);
      stats.inc("incompatibleConnectors", 1);
      stats.inc("connectorQueries", 5);
      return stats.snapshot();
    },
    assert: (r) =>
      r.registeredConnectors === 3 &&
      r.activeConnectors === 2 &&
      r.compatibleConnectors === 1 &&
      r.incompatibleConnectors === 1 &&
      r.connectorQueries === 5,
  },
  {
    id: 156,
    name: "resetStatistics zeroes all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 10);
      stats.inc("connectorQueries", 20);
      stats.resetStatistics();
      return stats.snapshot();
    },
    assert: (r) =>
      r.registeredConnectors === 0 &&
      r.activeConnectors === 0 &&
      r.compatibleConnectors === 0 &&
      r.incompatibleConnectors === 0 &&
      r.connectorQueries === 0,
  },
  {
    id: 157,
    name: "describeStatistics returns readable string",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 5);
      stats.inc("connectorQueries", 10);
      return stats.describeStatistics();
    },
    assert: (r) =>
      typeof r === "string" &&
      r.includes("Connector Registry") &&
      r.includes("Registered Connectors: 5") &&
      r.includes("Connector Queries: 10"),
  },
  {
    id: 158,
    name: "snapshot returns a copy (not mutable reference)",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 1);
      const snap1 = stats.snapshot();
      stats.inc("registeredConnectors", 1);
      const snap2 = stats.snapshot();
      return { snap1: snap1.registeredConnectors, snap2: snap2.registeredConnectors };
    },
    assert: (r) => r.snap1 === 1 && r.snap2 === 2,
  },
];