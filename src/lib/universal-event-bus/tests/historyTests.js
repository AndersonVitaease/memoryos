/**
 * Event History Tests (Sprint 28)
 * record, list, getByEvent, lastStatus, count, immutability, clear.
 */

import { createEventHistory } from "../eventHistory.js";
import { buildEvent, _resetIdsForTests } from "../eventBusContracts.js";

export const HISTORY_TESTS = [
  {
    id: 48,
    name: "record creates immutable history entry",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      const entry = hist.record("evt-1", "received", "from publisher");
      return { entry, frozen: Object.isFrozen(entry) };
    },
    assert: ({ entry, frozen }) =>
      entry.eventId === "evt-1" &&
      entry.status === "received" &&
      entry.detail === "from publisher" &&
      frozen === true,
  },
  {
    id: 49,
    name: "list returns all entries in order",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      hist.record("evt-1", "received");
      hist.record("evt-1", "published");
      hist.record("evt-2", "received");
      return { list: hist.list() };
    },
    assert: ({ list }) =>
      list.length === 3 &&
      list[0].status === "received" &&
      list[2].eventId === "evt-2",
  },
  {
    id: 50,
    name: "getByEvent returns entries for specific event",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      hist.record("evt-1", "received");
      hist.record("evt-1", "published");
      hist.record("evt-2", "received");
      return { entries: hist.getByEvent("evt-1") };
    },
    assert: ({ entries }) =>
      entries.length === 2 &&
      entries[0].status === "received" &&
      entries[1].status === "published",
  },
  {
    id: 51,
    name: "lastStatus returns the most recent status",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      hist.record("evt-1", "received");
      hist.record("evt-1", "published");
      hist.record("evt-1", "processed");
      return { status: hist.lastStatus("evt-1") };
    },
    assert: ({ status }) => status === "processed",
  },
  {
    id: 52,
    name: "lastStatus returns null for unknown event",
    run: () => {
      const hist = createEventHistory();
      return { status: hist.lastStatus("nonexistent") };
    },
    assert: ({ status }) => status === null,
  },
  {
    id: 53,
    name: "count returns total entries",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      hist.record("evt-1", "received");
      hist.record("evt-1", "published");
      return { count: hist.count() };
    },
    assert: ({ count }) => count === 2,
  },
  {
    id: 54,
    name: "countByStatus returns count for specific status",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      hist.record("evt-1", "received");
      hist.record("evt-1", "published");
      hist.record("evt-2", "received");
      return {
        received: hist.countByStatus("received"),
        published: hist.countByStatus("published"),
      };
    },
    assert: ({ received, published }) => received === 2 && published === 1,
  },
  {
    id: 55,
    name: "clear empties all history",
    run: () => {
      _resetIdsForTests();
      const hist = createEventHistory();
      hist.record("evt-1", "received");
      hist.record("evt-2", "published");
      hist.clear();
      return { count: hist.count(), byEvent: hist.getByEvent("evt-1").length };
    },
    assert: ({ count, byEvent }) => count === 0 && byEvent === 0,
  },
  {
    id: 56,
    name: "statuses returns all valid statuses",
    run: () => {
      const hist = createEventHistory();
      return { statuses: hist.statuses() };
    },
    assert: ({ statuses }) =>
      statuses.length === 8 &&
      statuses.includes("received") &&
      statuses.includes("processed") &&
      statuses.includes("discarded") &&
      statuses.includes("restored"),
  },
];