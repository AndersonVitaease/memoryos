/**
 * Queue Tests (Sprint 28)
 * enqueue, dequeue, peek, clear, size, isEmpty, FIFO, overflow.
 */

import { createQueue } from "../eventQueue.js";
import { buildEvent, _resetIdsForTests } from "../eventBusContracts.js";

export const QUEUE_TESTS = [
  {
    id: 13,
    name: "enqueue and dequeue maintain FIFO order",
    run: () => {
      _resetIdsForTests();
      const q = createQueue("test");
      const e1 = buildEvent({ eventType: "a" });
      const e2 = buildEvent({ eventType: "b" });
      const e3 = buildEvent({ eventType: "c" });
      q.enqueue(e1);
      q.enqueue(e2);
      q.enqueue(e3);
      return { d1: q.dequeue(), d2: q.dequeue(), d3: q.dequeue() };
    },
    assert: ({ d1, d2, d3 }) => d1.eventId === "evt-1" && d2.eventId === "evt-2" && d3.eventId === "evt-3",
  },
  {
    id: 14,
    name: "peek returns first without removing",
    run: () => {
      _resetIdsForTests();
      const q = createQueue("test");
      const e1 = buildEvent({ eventType: "a" });
      q.enqueue(e1);
      const peeked = q.peek();
      return { peeked, size: q.size() };
    },
    assert: ({ peeked, size }) => peeked.eventId === "evt-1" && size === 1,
  },
  {
    id: 15,
    name: "dequeue on empty queue returns null",
    run: () => {
      const q = createQueue("test");
      return { result: q.dequeue() };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 16,
    name: "size and isEmpty work correctly",
    run: () => {
      _resetIdsForTests();
      const q = createQueue("test");
      const emptyBefore = q.isEmpty();
      const sizeBefore = q.size();
      q.enqueue(buildEvent({ eventType: "x" }));
      const afterEnqueue = !q.isEmpty();
      const sizeAfter = q.size();
      q.dequeue();
      const afterDequeue = q.isEmpty();
      return { emptyBefore, sizeBefore, afterEnqueue, sizeAfter, afterDequeue };
    },
    assert: ({ emptyBefore, sizeBefore, afterEnqueue, sizeAfter, afterDequeue }) =>
      emptyBefore === true && sizeBefore === 0 && afterEnqueue === true && sizeAfter === 1 && afterDequeue === true,
  },
  {
    id: 17,
    name: "clear empties the queue",
    run: () => {
      _resetIdsForTests();
      const q = createQueue("test");
      q.enqueue(buildEvent({ eventType: "a" }));
      q.enqueue(buildEvent({ eventType: "b" }));
      q.clear();
      return { size: q.size(), empty: q.isEmpty() };
    },
    assert: ({ size, empty }) => size === 0 && empty === true,
  },
  {
    id: 18,
    name: "queue overflow — maxSize rejects excess events",
    run: () => {
      _resetIdsForTests();
      const q = createQueue("overflow", 2);
      const e1 = buildEvent({ eventType: "a" });
      const e2 = buildEvent({ eventType: "b" });
      const e3 = buildEvent({ eventType: "c" });
      const r1 = q.enqueue(e1);
      const r2 = q.enqueue(e2);
      const r3 = q.enqueue(e3);
      return { r1, r2, r3, size: q.size(), rejected: q.rejectedCount };
    },
    assert: ({ r1, r2, r3, size, rejected }) =>
      r1 === true && r2 === true && r3 === false && size === 2 && rejected === 1,
  },
  {
    id: 19,
    name: "enqueue rejects non-event objects",
    run: () => {
      const q = createQueue("test");
      return { r1: q.enqueue(null), r2: q.enqueue({}), r3: q.enqueue("string") };
    },
    assert: ({ r1, r2, r3 }) => r1 === false && r2 === false && r3 === false,
  },
  {
    id: 20,
    name: "toArray returns snapshot of queued events",
    run: () => {
      _resetIdsForTests();
      const q = createQueue("test");
      q.enqueue(buildEvent({ eventType: "a" }));
      q.enqueue(buildEvent({ eventType: "b" }));
      return { arr: q.toArray(), size: q.size() };
    },
    assert: ({ arr, size }) => arr.length === 2 && size === 2,
  },
];