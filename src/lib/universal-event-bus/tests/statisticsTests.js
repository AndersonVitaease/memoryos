/**
 * Statistics Tests (Sprint 28)
 * inc, dec, snapshot, setQueueSizes, describeStatistics, resetStatistics.
 */

import { createStatistics } from "../statistics.js";

export const STATISTICS_TESTS = [
  {
    id: 57,
    name: "inc increments counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("publishedEvents");
      stats.inc("publishedEvents");
      stats.inc("processedEvents");
      return { published: stats.get("publishedEvents"), processed: stats.get("processedEvents") };
    },
    assert: ({ published, processed }) => published === 2 && processed === 1,
  },
  {
    id: 58,
    name: "dec decrements counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("subscriptions", 5);
      stats.dec("subscriptions", 2);
      return { subscriptions: stats.get("subscriptions") };
    },
    assert: ({ subscriptions }) => subscriptions === 3,
  },
  {
    id: 59,
    name: "snapshot returns all counters including queueSizes",
    run: () => {
      const stats = createStatistics();
      stats.inc("publishedEvents", 10);
      stats.setQueueSizes({ CRITICAL: 3, LOW: 1 });
      const snap = stats.snapshot();
      return { snap };
    },
    assert: ({ snap }) =>
      snap.publishedEvents === 10 &&
      snap.queueSizes.CRITICAL === 3 &&
      snap.queueSizes.LOW === 1 &&
      "processedEvents" in snap,
  },
  {
    id: 60,
    name: "resetStatistics zeroes all counters",
    run: () => {
      const stats = createStatistics();
      stats.inc("publishedEvents", 10);
      stats.inc("processedEvents", 5);
      stats.setQueueSizes({ CRITICAL: 3 });
      stats.resetStatistics();
      const snap = stats.snapshot();
      return { snap };
    },
    assert: ({ snap }) =>
      snap.publishedEvents === 0 &&
      snap.processedEvents === 0 &&
      Object.keys(snap.queueSizes).length === 0,
  },
  {
    id: 61,
    name: "describeStatistics returns readable string",
    run: () => {
      const stats = createStatistics();
      stats.inc("publishedEvents", 5);
      stats.setQueueSizes({ CRITICAL: 2 });
      const desc = stats.describeStatistics();
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" &&
      desc.includes("Universal Event Bus") &&
      desc.includes("Published: 5") &&
      desc.includes("Queue Sizes"),
  },
  {
    id: 62,
    name: "get returns 0 for unknown key",
    run: () => {
      const stats = createStatistics();
      return { val: stats.get("nonexistent") };
    },
    assert: ({ val }) => val === 0,
  },
  {
    id: 63,
    name: "snapshot returns a copy (not mutable reference)",
    run: () => {
      const stats = createStatistics();
      stats.inc("publishedEvents", 1);
      const snap1 = stats.snapshot();
      stats.inc("publishedEvents", 1);
      const snap2 = stats.snapshot();
      return { snap1, snap2 };
    },
    assert: ({ snap1, snap2 }) => snap1.publishedEvents === 1 && snap2.publishedEvents === 2,
  },
];