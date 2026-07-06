/**
 * Bus Integration Tests (Sprint 28)
 * Full publish→consume→ack/nack flow, DLQ, restore, schedule, reset.
 */

import { createEventBus } from "../universalEventBus.js";
import { _resetIdsForTests } from "../eventBusContracts.js";

export const BUS_TESTS = [
  {
    id: 101,
    name: "publish → consume → ack full flow",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "test.event");
      bus.publish({ eventType: "test.event" });
      const consumed = bus.consume();
      const acked = bus.ack(consumed.event.eventId);
      const stats = bus.getStats();
      return { consumed, acked, stats };
    },
    assert: ({ consumed, acked, stats }) =>
      consumed !== null &&
      consumed.subscribers.includes("con-1") &&
      acked === true &&
      stats.publishedEvents === 1 &&
      stats.processedEvents === 1,
  },
  {
    id: 102,
    name: "nack triggers retry and re-enqueues event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "test.event");
      bus.publish({ eventType: "test.event" });
      const consumed = bus.consume();
      const nackResult = bus.nack(consumed.event.eventId);
      return { nackResult };
    },
    assert: ({ nackResult }) =>
      nackResult !== null && nackResult.action === "retried" && nackResult.record.attempt === 1,
  },
  {
    id: 103,
    name: "nack until max retries sends event to DLQ",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "test.event");
      const event = bus.publish({ eventType: "test.event" });
      // Default max attempts = 3
      // Consume and nack 3 times
      let lastNack = null;
      for (let i = 0; i < 3; i++) {
        const consumed = bus.consume();
        if (!consumed) break;
        lastNack = bus.nack(consumed.event.eventId);
      }
      const dlqSize = bus.deadLetterQueue.size();
      const stats = bus.getStats();
      return { lastNack, dlqSize, stats };
    },
    assert: ({ lastNack, dlqSize, stats }) =>
      lastNack.action === "dead_lettered" &&
      dlqSize === 1 &&
      stats.deadLetterEvents === 1,
  },
  {
    id: 104,
    name: "restore moves event from DLQ back to queue",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "test.event");
      bus.publish({ eventType: "test.event" });
      // Send to DLQ
      for (let i = 0; i < 3; i++) {
        const consumed = bus.consume();
        if (!consumed) break;
        bus.nack(consumed.event.eventId);
      }
      const dlqList = bus.deadLetterQueue.list();
      const restored = bus.restore(dlqList[0].event.eventId);
      const consumedAgain = bus.consume();
      return { restored, consumedAgain };
    },
    assert: ({ restored, consumedAgain }) =>
      restored !== null && consumedAgain !== null,
  },
  {
    id: 105,
    name: "schedule with 0 delay delivers on next consume",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "delayed.event");
      bus.schedule({ eventType: "delayed.event" }, 0);
      const consumed = bus.consume();
      return { consumed };
    },
    assert: ({ consumed }) =>
      consumed !== null && consumed.event.eventType === "delayed.event",
  },
  {
    id: 106,
    name: "publishBatch publishes all events",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "batch.event");
      const events = bus.publishBatch([
        { eventType: "batch.event" },
        { eventType: "batch.event" },
      ]);
      return { count: events.length, stats: bus.getStats() };
    },
    assert: ({ count, stats }) =>
      count === 2 && stats.publishedEvents === 2 && stats.queuedEvents === 2,
  },
  {
    id: 107,
    name: "pauseSubscription stops delivery to that consumer",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const sub = bus.subscribe("con-1", "test.event");
      bus.pauseSubscription(sub.subscriptionId);
      bus.publish({ eventType: "test.event" });
      const consumed = bus.consume();
      return { consumed };
    },
    assert: ({ consumed }) =>
      consumed !== null && consumed.subscribers.length === 0,
  },
  {
    id: 108,
    name: "resumeSubscription re-enables delivery",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const sub = bus.subscribe("con-1", "test.event");
      bus.pauseSubscription(sub.subscriptionId);
      bus.resumeSubscription(sub.subscriptionId);
      bus.publish({ eventType: "test.event" });
      const consumed = bus.consume();
      return { consumed };
    },
    assert: ({ consumed }) =>
      consumed !== null && consumed.subscribers.includes("con-1"),
  },
  {
    id: 109,
    name: "describe returns readable status string",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.publish({ eventType: "test" });
      const desc = bus.describe();
      return { desc };
    },
    assert: ({ desc }) =>
      typeof desc === "string" && desc.includes("Universal Event Bus") && desc.includes("Published: 1"),
  },
  {
    id: 110,
    name: "reset clears all bus state",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "test.event");
      bus.publish({ eventType: "test.event" });
      bus.consume();
      bus.reset();
      const stats = bus.getStats();
      return { stats, queueSize: bus.scheduler.size() };
    },
    assert: ({ stats, queueSize }) =>
      stats.publishedEvents === 0 && stats.subscriptions === 0 && queueSize === 0,
  },
  {
    id: 111,
    name: "priority respected in bus consume",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      bus.subscribe("con-1", "low.event");
      bus.subscribe("con-1", "crit.event");
      bus.publish({ eventType: "low.event", priority: "LOW" });
      bus.publish({ eventType: "crit.event", priority: "CRITICAL" });
      const first = bus.consume();
      const second = bus.consume();
      return { first: first.event.priority, second: second.event.priority };
    },
    assert: ({ first, second }) => first === "CRITICAL" && second === "LOW",
  },
];