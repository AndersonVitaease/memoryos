/**
 * Consumer Tests (Sprint 28)
 * subscribe, unsubscribe, pause, resume, consume, ack, nack.
 */

import { createEventBus } from "../universalEventBus.js";
import { createConsumer } from "../consumer.js";
import { _resetIdsForTests } from "../eventBusContracts.js";

export const CONSUMER_TESTS = [
  {
    id: 91,
    name: "createConsumer registers and returns frozen consumer",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      return { con, frozen: Object.isFrozen(con) };
    },
    assert: ({ con, frozen }) => con.name === "con-1" && frozen === true,
  },
  {
    id: 92,
    name: "subscribe creates a subscription",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      const sub = con.subscribe("test.event");
      return { sub, count: con.subscriptions().length };
    },
    assert: ({ sub, count }) =>
      sub.subscriptionId.startsWith("sub-") && sub.consumerName === "con-1" && count === 1,
  },
  {
    id: 93,
    name: "unsubscribe removes a subscription",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      const sub = con.subscribe("test.event");
      const result = con.unsubscribe(sub.subscriptionId);
      return { result, count: con.subscriptions().length };
    },
    assert: ({ result, count }) => result === true && count === 0,
  },
  {
    id: 94,
    name: "consume returns null when no events",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      return { result: con.consume() };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 95,
    name: "consume returns event with matching subscribers",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      con.subscribe("test.event");
      bus.publish({ eventType: "test.event" });
      const result = con.consume();
      return { result };
    },
    assert: ({ result }) =>
      result !== null &&
      result.event.eventType === "test.event" &&
      result.subscribers.includes("con-1"),
  },
  {
    id: 96,
    name: "consume auto-acks when no subscribers match",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      con.subscribe("other.event");
      bus.publish({ eventType: "unmatched.event" });
      const result = con.consume();
      return { result };
    },
    assert: ({ result }) =>
      result !== null && result.subscribers.length === 0,
  },
  {
    id: 97,
    name: "ack returns false for unknown event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      return { result: con.ack("nonexistent") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 98,
    name: "nack returns null for unknown event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      return { result: con.nack("nonexistent") };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 99,
    name: "createConsumer throws on missing name",
    run: () => {
      const bus = createEventBus();
      try {
        createConsumer(bus, "");
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 100,
    name: "consumer can subscribe to multiple event types",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const con = createConsumer(bus, "con-1");
      con.subscribe("event.a");
      con.subscribe("event.b");
      con.subscribe("event.c");
      return { count: con.subscriptions().length };
    },
    assert: ({ count }) => count === 3,
  },
];