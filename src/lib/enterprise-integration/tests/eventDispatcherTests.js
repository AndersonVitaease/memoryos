/**
 * Event Dispatcher Tests (Sprint 27)
 * receiveEvent, subscribe, unsubscribe, dispatch, ack, nack.
 */

import { createEventDispatcher } from "../eventDispatcher.js";
import { createConnectorRegistry } from "../connectorRegistry.js";
import { createStatistics } from "../statistics.js";
import { _resetIdsForTests } from "../contracts.js";

function _setup() {
  _resetIdsForTests();
  const stats = createStatistics();
  const registry = createConnectorRegistry();
  return { stats, registry, dispatcher: createEventDispatcher(registry, stats) };
}

export const EVENT_DISPATCHER_TESTS = [
  {
    id: 49,
    name: "receiveEvent returns standardized frozen event",
    run: () => {
      const { dispatcher } = _setup();
      const event = dispatcher.receiveEvent({ eventType: "CALL_RECEIVED", companyId: "co1" });
      return { event, frozen: Object.isFrozen(event) };
    },
    assert: ({ event, frozen }) =>
      event.eventId === "eil-evt-1" &&
      event.eventType === "CALL_RECEIVED" &&
      event.companyId === "co1" &&
      frozen === true,
  },
  {
    id: 50,
    name: "receiveEvent increments dispatchedEvents counter",
    run: () => {
      const { dispatcher, stats } = _setup();
      dispatcher.receiveEvent({ eventType: "LOGIN" });
      dispatcher.receiveEvent({ eventType: "LOGOUT" });
      return { count: stats.get("dispatchedEvents") };
    },
    assert: ({ count }) => count === 2,
  },
  {
    id: 51,
    name: "subscribe returns frozen subscription",
    run: () => {
      const { dispatcher } = _setup();
      const sub = dispatcher.subscribe("notification-service", "ORDER_CREATED");
      return { sub, frozen: Object.isFrozen(sub) };
    },
    assert: ({ sub, frozen }) =>
      sub.subscriptionId.startsWith("eil-sub-") &&
      sub.subscriberName === "notification-service" &&
      sub.eventType === "ORDER_CREATED" &&
      frozen === true,
  },
  {
    id: 52,
    name: "dispatch returns event with matching subscribers",
    run: () => {
      const { dispatcher } = _setup();
      dispatcher.subscribe("svc-a", "ORDER_CREATED");
      dispatcher.subscribe("svc-b", "ORDER_CANCELLED");
      dispatcher.receiveEvent({ eventType: "ORDER_CREATED" });
      const result = dispatcher.dispatch();
      return { result };
    },
    assert: ({ result }) =>
      result !== null &&
      result.event.eventType === "ORDER_CREATED" &&
      result.subscribers.includes("svc-a") &&
      !result.subscribers.includes("svc-b"),
  },
  {
    id: 53,
    name: "dispatch returns null when queue empty",
    run: () => {
      const { dispatcher } = _setup();
      return { result: dispatcher.dispatch() };
    },
    assert: ({ result }) => result === null,
  },
  {
    id: 54,
    name: "dispatch with no subscribers returns empty array",
    run: () => {
      const { dispatcher } = _setup();
      dispatcher.receiveEvent({ eventType: "CALL_RECEIVED" });
      const result = dispatcher.dispatch();
      return { result };
    },
    assert: ({ result }) =>
      result !== null && result.subscribers.length === 0,
  },
  {
    id: 55,
    name: "unsubscribe removes subscription",
    run: () => {
      const { dispatcher } = _setup();
      const sub = dispatcher.subscribe("svc", "LOGIN");
      const removed = dispatcher.unsubscribe(sub.subscriptionId);
      return { removed, count: dispatcher.subscriptionCount() };
    },
    assert: ({ removed, count }) => removed === true && count === 0,
  },
  {
    id: 56,
    name: "ack removes in-flight event",
    run: () => {
      const { dispatcher } = _setup();
      dispatcher.receiveEvent({ eventType: "LOGIN" });
      const { event } = dispatcher.dispatch();
      const acked = dispatcher.ack(event.eventId);
      return { acked, inFlight: dispatcher.inFlightCount() };
    },
    assert: ({ acked, inFlight }) => acked === true && inFlight === 0,
  },
  {
    id: 57,
    name: "nack re-enqueues event and increments failedEvents",
    run: () => {
      const { dispatcher, stats } = _setup();
      dispatcher.receiveEvent({ eventType: "LOGIN" });
      const { event } = dispatcher.dispatch();
      dispatcher.nack(event.eventId);
      return { pending: dispatcher.pendingCount(), failed: stats.get("failedEvents") };
    },
    assert: ({ pending, failed }) => pending === 1 && failed === 1,
  },
  {
    id: 58,
    name: "reset clears all dispatcher state",
    run: () => {
      const { dispatcher } = _setup();
      dispatcher.subscribe("svc", "LOGIN");
      dispatcher.receiveEvent({ eventType: "LOGIN" });
      dispatcher.dispatch();
      dispatcher.reset();
      return {
        pending: dispatcher.pendingCount(),
        subs: dispatcher.subscriptionCount(),
        inFlight: dispatcher.inFlightCount(),
      };
    },
    assert: ({ pending, subs, inFlight }) =>
      pending === 0 && subs === 0 && inFlight === 0,
  },
];