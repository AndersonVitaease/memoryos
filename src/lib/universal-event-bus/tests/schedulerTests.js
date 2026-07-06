/**
 * Scheduler Tests (Sprint 28)
 * Priority ordering, no starvation, peek, queueSizes, clear.
 */

import { createPriorityScheduler } from "../priorityScheduler.js";
import { buildEvent, _resetIdsForTests } from "../eventBusContracts.js";

export const SCHEDULER_TESTS = [
  {
    id: 21,
    name: "CRITICAL events served before LOW events",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      const low = buildEvent({ eventType: "low", priority: "LOW" });
      const crit = buildEvent({ eventType: "crit", priority: "CRITICAL" });
      sched.enqueue(low);
      sched.enqueue(crit);
      const first = sched.next();
      const second = sched.next();
      return { first, second };
    },
    assert: ({ first, second }) =>
      first.priority === "CRITICAL" && second.priority === "LOW",
  },
  {
    id: 22,
    name: "Priority order: CRITICAL > HIGH > NORMAL > LOW > BACKGROUND",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      sched.enqueue(buildEvent({ eventType: "bg", priority: "BACKGROUND" }));
      sched.enqueue(buildEvent({ eventType: "low", priority: "LOW" }));
      sched.enqueue(buildEvent({ eventType: "norm", priority: "NORMAL" }));
      sched.enqueue(buildEvent({ eventType: "high", priority: "HIGH" }));
      sched.enqueue(buildEvent({ eventType: "crit", priority: "CRITICAL" }));
      const order = [];
      for (let i = 0; i < 5; i++) order.push(sched.next().priority);
      return { order };
    },
    assert: ({ order }) =>
      order[0] === "CRITICAL" &&
      order[1] === "HIGH" &&
      order[2] === "NORMAL" &&
      order[3] === "LOW" &&
      order[4] === "BACKGROUND",
  },
  {
    id: 23,
    name: "No starvation — LOW event served even with continuous CRITICAL",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      sched.enqueue(buildEvent({ eventType: "low", priority: "LOW" }));
      for (let i = 0; i < 20; i++) {
        sched.enqueue(buildEvent({ eventType: "crit", priority: "CRITICAL" }));
      }
      const served = [];
      for (let i = 0; i < 25; i++) {
        const e = sched.next();
        if (!e) break;
        served.push(e.priority);
      }
      const lowServed = served.includes("LOW");
      return { lowServed, total: served.length };
    },
    assert: ({ lowServed, total }) => lowServed === true && total === 21,
  },
  {
    id: 24,
    name: "No starvation — BACKGROUND event eventually served",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      sched.enqueue(buildEvent({ eventType: "bg", priority: "BACKGROUND" }));
      for (let i = 0; i < 30; i++) {
        sched.enqueue(buildEvent({ eventType: "high", priority: "HIGH" }));
      }
      let bgServed = false;
      for (let i = 0; i < 40; i++) {
        const e = sched.next();
        if (!e) break;
        if (e.priority === "BACKGROUND") bgServed = true;
      }
      return { bgServed };
    },
    assert: ({ bgServed }) => bgServed === true,
  },
  {
    id: 25,
    name: "next() returns null when all queues empty",
    run: () => {
      const sched = createPriorityScheduler();
      return { result: sched.next() };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 26,
    name: "peek returns highest priority without dequeuing",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      sched.enqueue(buildEvent({ eventType: "low", priority: "LOW" }));
      sched.enqueue(buildEvent({ eventType: "crit", priority: "CRITICAL" }));
      const peeked = sched.peek();
      return { peeked, size: sched.size() };
    },
    assert: ({ peeked, size }) => peeked.priority === "CRITICAL" && size === 2,
  },
  {
    id: 27,
    name: "queueSizes returns count per priority",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      sched.enqueue(buildEvent({ eventType: "a", priority: "CRITICAL" }));
      sched.enqueue(buildEvent({ eventType: "b", priority: "CRITICAL" }));
      sched.enqueue(buildEvent({ eventType: "c", priority: "LOW" }));
      return { sizes: sched.queueSizes() };
    },
    assert: ({ sizes }) =>
      sizes.CRITICAL === 2 && sizes.LOW === 1 && sizes.HIGH === 0 && sizes.BACKGROUND === 0,
  },
  {
    id: 28,
    name: "clear resets all queues",
    run: () => {
      _resetIdsForTests();
      const sched = createPriorityScheduler();
      sched.enqueue(buildEvent({ eventType: "a", priority: "CRITICAL" }));
      sched.enqueue(buildEvent({ eventType: "b", priority: "LOW" }));
      sched.clear();
      return { size: sched.size(), served: sched.servedCount() };
    },
    assert: ({ size, served }) => size === 0 && served === 0,
  },
];