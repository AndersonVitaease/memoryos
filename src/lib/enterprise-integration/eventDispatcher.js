/**
 * Event Dispatcher (Sprint 27)
 *
 * Recebe eventos externos, padroniza e disponibiliza para consumo.
 * NÃO executa IA. Apenas padroniza eventos.
 */

import { buildEvent } from "./contracts.js";

let _subIdCounter = 0;

export function createEventDispatcher(registry, statistics) {
  const _queue = [];
  const _subscriptions = new Map();
  const _inFlight = new Map();

  function receiveEvent(eventData = {}) {
    const event = buildEvent(eventData);
    _queue.push(event);
    if (statistics) statistics.inc("dispatchedEvents");
    return event;
  }

  function subscribe(subscriberName, eventType) {
    if (!subscriberName || typeof subscriberName !== "string") {
      throw new Error("subscriberName is required");
    }
    if (!eventType || typeof eventType !== "string") {
      throw new Error("eventType is required");
    }

    _subIdCounter++;
    const sub = Object.freeze({
      subscriptionId: `eil-sub-${_subIdCounter}`,
      subscriberName,
      eventType,
      active: true,
      createdAt: new Date().toISOString(),
    });

    _subscriptions.set(sub.subscriptionId, sub);
    return sub;
  }

  function unsubscribe(subscriptionId) {
    return _subscriptions.delete(subscriptionId);
  }

  function _findSubscribers(eventType) {
    const subscribers = [];
    for (const sub of _subscriptions.values()) {
      if (sub.active && sub.eventType === eventType) {
        subscribers.push(sub.subscriberName);
      }
    }
    return subscribers;
  }

  function dispatch() {
    if (_queue.length === 0) return null;

    const event = _queue.shift();
    const subscribers = _findSubscribers(event.eventType);
    _inFlight.set(event.eventId, event);

    return Object.freeze({ event, subscribers });
  }

  function ack(eventId) {
    return _inFlight.delete(eventId);
  }

  function nack(eventId) {
    const event = _inFlight.get(eventId);
    if (!event) return null;
    _inFlight.delete(eventId);
    _queue.push(event);
    if (statistics) statistics.inc("failedEvents");
    return event;
  }

  function pendingCount() {
    return _queue.length;
  }

  function inFlightCount() {
    return _inFlight.size;
  }

  function subscriptionCount() {
    return _subscriptions.size;
  }

  function listSubscriptions() {
    return [..._subscriptions.values()];
  }

  function reset() {
    _queue.length = 0;
    _subscriptions.clear();
    _inFlight.clear();
    _subIdCounter = 0;
  }

  return Object.freeze({
    receiveEvent,
    subscribe,
    unsubscribe,
    dispatch,
    ack,
    nack,
    pendingCount,
    inFlightCount,
    subscriptionCount,
    listSubscriptions,
    reset,
  });
}