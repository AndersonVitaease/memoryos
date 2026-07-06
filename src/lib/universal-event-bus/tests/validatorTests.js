/**
 * Validator Tests (Sprint 28)
 * validateEvent, validatePriority, validateQueue, validatePublisher,
 * validateConsumer, validateSubscription, validateRetry, validateParticipant.
 * All return { valid, errors }. Never throw.
 */

import {
  validateEvent,
  validatePriority,
  validateQueue,
  validatePublisher,
  validateConsumer,
  validateSubscription,
  validateRetry,
  validateParticipant,
} from "../validators.js";
import {
  buildEvent,
  buildSubscription,
  buildParticipant,
  _resetIdsForTests,
} from "../eventBusContracts.js";
import { createQueue } from "../eventQueue.js";
import { createPublisher } from "../publisher.js";
import { createConsumer } from "../consumer.js";

function _makeBus() {
  const subs = new Map();
  const byType = new Map();
  return {
    registerPublisher: () => {},
    registerConsumer: () => {},
    publish: (e) => ({ ...e, eventId: "evt-1" }),
    publishBatch: (es) => es,
    schedule: (e) => ({ ...e, eventId: "evt-1" }),
    cancel: () => true,
    retry: () => null,
    discard: () => null,
    subscribe: (name, eventType) => {
      const sub = buildSubscription({ consumerName: name, eventType });
      subs.set(sub.subscriptionId, sub);
      return sub;
    },
    unsubscribe: (id) => subs.delete(id),
    pauseSubscription: (id) => subs.get(id) || null,
    resumeSubscription: (id) => subs.get(id) || null,
    consume: () => null,
    ack: () => true,
    nack: () => null,
  };
}

export const VALIDATOR_TESTS = [
  {
    id: 64,
    name: "validateEvent returns valid for correct event",
    run: () => {
      _resetIdsForTests();
      const e = buildEvent({ eventType: "test", priority: "HIGH" });
      return validateEvent(e);
    },
    assert: (r) => r.valid === true && r.errors.length === 0,
  },
  {
    id: 65,
    name: "validateEvent returns invalid for missing fields",
    run: () => {
      return validateEvent({ eventId: "x" });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 66,
    name: "validateEvent returns invalid for non-frozen object",
    run: () => {
      const e = { eventId: "evt-1", eventType: "test", priority: "NORMAL", timestamp: "t", companyId: "", tenantId: "", userId: "", sessionId: "", correlationId: "", connectorId: "", source: "", target: "", payload: {}, metadata: {} };
      return validateEvent(e);
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("frozen")),
  },
  {
    id: 67,
    name: "validateEvent returns invalid for non-object",
    run: () => {
      return validateEvent(null);
    },
    assert: (r) => r.valid === false,
  },
  {
    id: 68,
    name: "validatePriority returns valid for all priorities",
    run: () => {
      const results = ["CRITICAL", "HIGH", "NORMAL", "LOW", "BACKGROUND"].map((p) => validatePriority(p));
      return { results };
    },
    assert: ({ results }) => results.every((r) => r.valid === true),
  },
  {
    id: 69,
    name: "validatePriority returns invalid for bad priority",
    run: () => {
      return validatePriority("URGENT");
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 70,
    name: "validateQueue returns valid for proper queue",
    run: () => {
      const q = createQueue("test");
      return validateQueue(q);
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 71,
    name: "validateQueue returns invalid for missing methods",
    run: () => {
      return validateQueue({ enqueue: () => {} });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 72,
    name: "validatePublisher returns valid for proper publisher",
    run: () => {
      _resetIdsForTests();
      const bus = _makeBus();
      const pub = createPublisher(bus, "pub-1");
      return validatePublisher(pub);
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 73,
    name: "validatePublisher returns invalid for missing methods",
    run: () => {
      return validatePublisher({ publish: () => {} });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 74,
    name: "validateConsumer returns valid for proper consumer",
    run: () => {
      _resetIdsForTests();
      const bus = _makeBus();
      const con = createConsumer(bus, "con-1");
      return validateConsumer(con);
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 75,
    name: "validateConsumer returns invalid for missing methods",
    run: () => {
      return validateConsumer({ subscribe: () => {} });
    },
    assert: (r) => r.valid === false && r.errors.length > 0,
  },
  {
    id: 76,
    name: "validateSubscription returns valid for proper subscription",
    run: () => {
      _resetIdsForTests();
      const s = buildSubscription({ consumerName: "c1", eventType: "test.event" });
      return validateSubscription(s);
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 77,
    name: "validateSubscription returns invalid for non-frozen",
    run: () => {
      const s = {
        subscriptionId: "sub-1",
        createdAt: "t",
        consumerName: "c1",
        eventType: "test",
        active: true,
        paused: false,
        metadata: {},
      };
      return validateSubscription(s);
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("frozen")),
  },
  {
    id: 78,
    name: "validateRetry returns valid for proper record",
    run: () => {
      return validateRetry({ attempt: 1, maxAttempts: 3 });
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 79,
    name: "validateRetry returns invalid when attempt exceeds maxAttempts",
    run: () => {
      return validateRetry({ attempt: 5, maxAttempts: 3 });
    },
    assert: (r) => r.valid === false && r.errors.some((e) => e.includes("exceeds")),
  },
  {
    id: 80,
    name: "validateRetry never throws on null input",
    run: () => {
      try {
        const r = validateRetry(null);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
  {
    id: 81,
    name: "validateParticipant returns valid for proper participant",
    run: () => {
      _resetIdsForTests();
      const p = buildParticipant({ kind: "publisher", name: "pub-1" });
      return validateParticipant(p);
    },
    assert: (r) => r.valid === true,
  },
  {
    id: 82,
    name: "validateEvent never throws on null input",
    run: () => {
      try {
        const r = validateEvent(null);
        return { r };
      } catch (err) {
        return { threw: true };
      }
    },
    assert: ({ r, threw }) => threw !== true && r.valid === false,
  },
];