/**
 * Dead Letter Queue Tests (Sprint 28)
 * send, list, get, restore, discard, clear, size, isEmpty, has.
 */

import { createDeadLetterQueue } from "../deadLetterQueue.js";
import { buildEvent, _resetIdsForTests } from "../eventBusContracts.js";

export const DLQ_TESTS = [
  {
    id: 39,
    name: "send stores event in DLQ",
    run: () => {
      _resetIdsForTests();
      const dlq = createDeadLetterQueue();
      const event = buildEvent({ eventType: "test" });
      const result = dlq.send(event, "max_retries_exceeded");
      return { result, size: dlq.size(), has: dlq.has(event.eventId) };
    },
    assert: ({ result, size, has }) => result === true && size === 1 && has === true,
  },
  {
    id: 40,
    name: "list returns all DLQ entries",
    run: () => {
      _resetIdsForTests();
      const dlq = createDeadLetterQueue();
      dlq.send(buildEvent({ eventType: "a" }), "reason1");
      dlq.send(buildEvent({ eventType: "b" }), "reason2");
      return { list: dlq.list() };
    },
    assert: ({ list }) => list.length === 2 && list[0].reason === "reason1" && list[1].reason === "reason2",
  },
  {
    id: 41,
    name: "get returns specific DLQ entry",
    run: () => {
      _resetIdsForTests();
      const dlq = createDeadLetterQueue();
      const event = buildEvent({ eventType: "test" });
      dlq.send(event, "test_reason");
      const entry = dlq.get(event.eventId);
      return { entry, eventId: event.eventId };
    },
    assert: ({ entry, eventId }) =>
      entry !== null && entry.event.eventId === eventId && entry.reason === "test_reason",
  },
  {
    id: 42,
    name: "restore removes and returns event from DLQ",
    run: () => {
      _resetIdsForTests();
      const dlq = createDeadLetterQueue();
      const event = buildEvent({ eventType: "test" });
      dlq.send(event, "max_retries");
      const restored = dlq.restore(event.eventId);
      return { restored, eventId: event.eventId, size: dlq.size(), has: dlq.has(event.eventId) };
    },
    assert: ({ restored, eventId, size, has }) =>
      restored.eventId === eventId && size === 0 && has === false,
  },
  {
    id: 43,
    name: "restore returns null for nonexistent event",
    run: () => {
      const dlq = createDeadLetterQueue();
      return { result: dlq.restore("nonexistent") };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 44,
    name: "discard removes event from DLQ",
    run: () => {
      _resetIdsForTests();
      const dlq = createDeadLetterQueue();
      const event = buildEvent({ eventType: "test" });
      dlq.send(event);
      const result = dlq.discard(event.eventId);
      return { result, size: dlq.size() };
    },
    assert: ({ result, size }) => result === true && size === 0,
  },
  {
    id: 45,
    name: "clear empties the DLQ",
    run: () => {
      _resetIdsForTests();
      const dlq = createDeadLetterQueue();
      dlq.send(buildEvent({ eventType: "a" }));
      dlq.send(buildEvent({ eventType: "b" }));
      dlq.send(buildEvent({ eventType: "c" }));
      dlq.clear();
      return { size: dlq.size(), empty: dlq.isEmpty() };
    },
    assert: ({ size, empty }) => size === 0 && empty === true,
  },
  {
    id: 46,
    name: "isEmpty returns true on new DLQ",
    run: () => {
      const dlq = createDeadLetterQueue();
      return { empty: dlq.isEmpty() };
    },
    assert: ({ empty }) => empty === true,
  },
  {
    id: 47,
    name: "send rejects invalid events",
    run: () => {
      const dlq = createDeadLetterQueue();
      return { r1: dlq.send(null), r2: dlq.send({}), r3: dlq.send("string") };
    },
    assert: ({ r1, r2, r3 }) => r1 === false && r2 === false && r3 === false,
  },
];