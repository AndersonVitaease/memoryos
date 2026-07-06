/**
 * Retry Manager Tests (Sprint 28)
 * retry, retryLater, maxRetries, shouldDiscard, canRetry, clearAttempt.
 */

import { createRetryManager } from "../retryManager.js";
import { buildEvent, _resetIdsForTests } from "../eventBusContracts.js";

export const RETRY_TESTS = [
  {
    id: 29,
    name: "retry increments attempt counter",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      const r1 = rm.retry(event);
      const r2 = rm.retry(event);
      return { r1: r1.attempt, r2: r2.attempt };
    },
    assert: ({ r1, r2 }) => r1 === 1 && r2 === 2,
  },
  {
    id: 30,
    name: "canRetry returns true when attempts remain",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      rm.retry(event);
      rm.retry(event);
      return { canRetry: rm.canRetry(event.eventId) };
    },
    assert: ({ canRetry }) => canRetry === true,
  },
  {
    id: 31,
    name: "shouldDiscard returns true when maxAttempts reached",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      rm.retry(event, 2);
      rm.retry(event, 2);
      return {
        shouldDiscard: rm.shouldDiscard(event.eventId),
        attempt: rm.getAttempt(event.eventId),
      };
    },
    assert: ({ shouldDiscard, attempt }) => shouldDiscard === true && attempt === 2,
  },
  {
    id: 32,
    name: "canRetry returns false when maxAttempts reached",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      rm.retry(event, 1);
      return { canRetry: rm.canRetry(event.eventId) };
    },
    assert: ({ canRetry }) => canRetry === false,
  },
  {
    id: 33,
    name: "retryLater sets nextRetry timestamp in the future",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      const rec = rm.retryLater(event, 5000);
      return { rec };
    },
    assert: ({ rec }) =>
      rec.attempt === 1 &&
      rec.lastRetry !== null &&
      rec.nextRetry !== null &&
      rec.nextRetry > rec.lastRetry,
  },
  {
    id: 34,
    name: "maxRetries returns configured max",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      rm.retry(event, 5);
      return { max: rm.maxRetries(event.eventId) };
    },
    assert: ({ max }) => max === 5,
  },
  {
    id: 35,
    name: "maxRetries returns default when no record",
    run: () => {
      const rm = createRetryManager();
      return { max: rm.maxRetries("nonexistent"), defaultMax: rm.defaultMaxAttempts() };
    },
    assert: ({ max, defaultMax }) => max === defaultMax && max === 3,
  },
  {
    id: 36,
    name: "clearAttempt removes retry record",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      rm.retry(event);
      const cleared = rm.clearAttempt(event.eventId);
      return { cleared, attempt: rm.getAttempt(event.eventId) };
    },
    assert: ({ cleared, attempt }) => cleared === true && attempt === 0,
  },
  {
    id: 37,
    name: "getRecord returns frozen retry record",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const event = buildEvent({ eventType: "test" });
      rm.retry(event, 3);
      const rec = rm.getRecord(event.eventId);
      return { rec, frozen: Object.isFrozen(rec) };
    },
    assert: ({ rec, frozen }) =>
      rec !== null && rec.attempt === 1 && rec.maxAttempts === 3 && frozen === true,
  },
  {
    id: 38,
    name: "reset clears all retry records",
    run: () => {
      _resetIdsForTests();
      const rm = createRetryManager();
      const e1 = buildEvent({ eventType: "a" });
      const e2 = buildEvent({ eventType: "b" });
      rm.retry(e1);
      rm.retry(e2);
      rm.reset();
      return { size: rm.size() };
    },
    assert: ({ size }) => size === 0,
  },
];