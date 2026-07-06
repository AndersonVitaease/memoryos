/**
 * Statistics Tests (Sprint 30)
 */

import { createStatistics } from "../statistics.js";

export const STATISTICS_TESTS = [
  {
    id: 121,
    name: "createStatistics returns frozen object",
    run: () => createStatistics(),
    assert: (r) => Object.isFrozen(r),
  },
  {
    id: 122,
    name: "inc increments executedScenarios",
    run: () => {
      const stats = createStatistics();
      stats.inc("executedScenarios");
      stats.inc("executedScenarios");
      return stats.get("executedScenarios");
    },
    assert: (r) => r === 2,
  },
  {
    id: 123,
    name: "inc increments simulatedEvents",
    run: () => {
      const stats = createStatistics();
      stats.inc("simulatedEvents", 5);
      return stats.get("simulatedEvents");
    },
    assert: (r) => r === 5,
  },
  {
    id: 124,
    name: "dec decrements counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("simulatedActions", 10);
      stats.dec("simulatedActions", 3);
      return stats.get("simulatedActions");
    },
    assert: (r) => r === 7,
  },
  {
    id: 125,
    name: "get returns 0 for unknown key",
    run: () => {
      const stats = createStatistics();
      return stats.get("nonexistent");
    },
    assert: (r) => r === 0,
  },
  {
    id: 126,
    name: "inc on unknown key does nothing",
    run: () => {
      const stats = createStatistics();
      stats.inc("unknownKey", 5);
      return stats.get("unknownKey");
    },
    assert: (r) => r === 0,
  },
  {
    id: 127,
    name: "snapshot returns all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("executedScenarios", 3);
      stats.inc("simulatedEvents", 7);
      stats.inc("simulatedActions", 2);
      stats.inc("simulatedFailures", 1);
      stats.inc("simulatedLatencies", 4);
      return stats.snapshot();
    },
    assert: (r) =>
      r.executedScenarios === 3 &&
      r.simulatedEvents === 7 &&
      r.simulatedActions === 2 &&
      r.simulatedFailures === 1 &&
      r.simulatedLatencies === 4,
  },
  {
    id: 128,
    name: "resetStatistics zeroes all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("executedScenarios", 10);
      stats.inc("simulatedEvents", 20);
      stats.resetStatistics();
      return stats.snapshot();
    },
    assert: (r) =>
      r.executedScenarios === 0 &&
      r.simulatedEvents === 0 &&
      r.simulatedActions === 0 &&
      r.simulatedFailures === 0 &&
      r.simulatedLatencies === 0,
  },
  {
    id: 129,
    name: "describeStatistics returns readable string",
    run: () => {
      const stats = createStatistics();
      stats.inc("executedScenarios", 5);
      stats.inc("simulatedEvents", 10);
      const desc = stats.describeStatistics();
      return { desc };
    },
    assert: (r) =>
      typeof r.desc === "string" &&
      r.desc.includes("Connector Simulator") &&
      r.desc.includes("Executed Scenarios: 5") &&
      r.desc.includes("Simulated Events: 10"),
  },
  {
    id: 130,
    name: "snapshot returns a copy (not mutable reference)",
    run: () => {
      const stats = createStatistics();
      stats.inc("executedScenarios", 1);
      const snap1 = stats.snapshot();
      stats.inc("executedScenarios", 1);
      const snap2 = stats.snapshot();
      return { snap1: snap1.executedScenarios, snap2: snap2.executedScenarios };
    },
    assert: (r) => r.snap1 === 1 && r.snap2 === 2,
  },
];