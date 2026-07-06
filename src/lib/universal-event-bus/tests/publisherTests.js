/**
 * Publisher Tests (Sprint 28)
 * publish, publishBatch, schedule, cancel, retry, discard.
 */

import { createEventBus } from "../universalEventBus.js";
import { createPublisher } from "../publisher.js";
import { _resetIdsForTests } from "../eventBusContracts.js";

export const PUBLISHER_TESTS = [
  {
    id: 83,
    name: "createPublisher registers and returns frozen publisher",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const pub = createPublisher(bus, "pub-1");
      return { pub, frozen: Object.isFrozen(pub) };
    },
    assert: ({ pub, frozen }) => pub.name === "pub-1" && frozen === true,
  },
  {
    id: 84,
    name: "publish delegates to bus and returns event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const pub = createPublisher(bus, "pub-1");
      const event = pub.publish({ eventType: "test.event", priority: "HIGH" });
      return { event };
    },
    assert: ({ event }) =>
      event.eventId === "evt-1" && event.eventType === "test.event" && event.priority === "HIGH",
  },
  {
    id: 85,
    name: "publishBatch publishes multiple events",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const pub = createPublisher(bus, "pub-1");
      const events = pub.publishBatch([
        { eventType: "a" },
        { eventType: "b" },
        { eventType: "c" },
      ]);
      return { count: events.length, ids: events.map((e) => e.eventId) };
    },
    assert: ({ count, ids }) => count === 3 && ids[0] === "evt-1" && ids[2] === "evt-3",
  },
  {
    id: 86,
    name: "schedule creates a scheduled event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const pub = createPublisher(bus, "pub-1");
      const event = pub.schedule({ eventType: "delayed.event" }, 1000);
      const stats = bus.getStats();
      return { event, published: stats.publishedEvents };
    },
    assert: ({ event, published }) =>
      event.eventId === "evt-1" && published === 1,
  },
  {
    id: 87,
    name: "cancel removes a scheduled event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const pub = createPublisher(bus, "pub-1");
      const event = pub.schedule({ eventType: "delayed" }, 5000);
      const cancelled = pub.cancel(event.eventId);
      return { cancelled };
    },
    assert: ({ cancelled }) => cancelled === true,
  },
  {
    id: 88,
    name: "cancel returns false for nonexistent event",
    run: () => {
      _resetIdsForTests();
      const bus = createEventBus();
      const pub = createPublisher(bus, "pub-1");
      return { result: pub.cancel("nonexistent") };
    },
    assert: ({ result }) => result === false,
  },
  {
    id: 89,
    name: "createPublisher throws on missing name",
    run: () => {
      const bus = createEventBus();
      try {
        createPublisher(bus, "");
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
  {
    id: 90,
    name: "createPublisher throws on missing bus",
    run: () => {
      try {
        createPublisher(null, "pub-1");
        return { threw: false };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ threw }) => threw === true,
  },
];