/**
 * Statistics Tests (Sprint 27)
 * inc, dec, get, snapshot, describeStatistics, resetStatistics.
 */

import { createStatistics } from "../statistics.js";

export const STATISTICS_TESTS = [
  {
    id: 69,
    name: "inc increments counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("dispatchedEvents");
      stats.inc("dispatchedEvents");
      stats.inc("dispatchedActions", 5);
      return { events: stats.get("dispatchedEvents"), actions: stats.get("dispatchedActions") };
    },
    assert: ({ events, actions }) => events === 2 && actions === 5,
  },
  {
    id: 70,
    name: "dec decrements counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 5);
      stats.dec("registeredConnectors", 2);
      return { count: stats.get("registeredConnectors") };
    },
    assert: ({ count }) => count === 3,
  },
  {
    id: 71,
    name: "dec does not go below zero",
    run: () => {
      const stats = createStatistics();
      stats.inc("activeConnectors", 2);
      stats.dec("activeConnectors", 5);
      return { count: stats.get("activeConnectors") };
    },
    assert: ({ count }) => count === 0,
  },
  {
    id: 72,
    name: "get returns 0 for unknown key",
    run: () => {
      const stats = createStatistics();
      return { val: stats.get("nonexistent") };
    },
    assert: ({ val }) => val === 0,
  },
  {
    id: 73,
    name: "snapshot returns frozen copy of all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("dispatchedEvents", 3);
      const snap = stats.snapshot();
      return { snap, frozen: Object.isFrozen(snap) };
    },
    assert: ({ snap, frozen }) =>
      snap.dispatchedEvents === 3 &&
      snap.registeredConnectors === 0 &&
      frozen === true,
  },
  {
    id: 74,
    name: "describeStatistics returns readable string",
    run: () => {
      const stats = createStatistics();
      stats.inc("registeredConnectors", 2);
      const desc = stats.describeStatistics();
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" &&
      desc.includes("Enterprise Integration Layer") &&
      desc.includes("Registered Connectors: 2"),
  },
  {
    id: 75,
    name: "resetStatistics zeroes all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("dispatchedEvents", 10);
      stats.inc("failedActions", 5);
      stats.resetStatistics();
      return { snap: stats.snapshot() };
    },
    assert: ({ snap }) =>
      snap.dispatchedEvents === 0 && snap.failedActions === 0,
  },
  {
    id: 76,
    name: "inc ignores invalid keys",
    run: () => {
      const stats = createStatistics();
      stats.inc("invalidKey", 5);
      return { val: stats.get("invalidKey") };
    },
    assert: ({ val }) => val === 0,
  },
];