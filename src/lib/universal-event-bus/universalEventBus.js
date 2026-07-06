/**
 * Universal Event Bus (Sprint 28)
 *
 * Camada central de comunicação interna do MemoryOS.
 *
 * Após esta Sprint, nenhum Engine poderá comunicar-se diretamente
 * com outro Engine ou Connector. Toda comunicação ocorre exclusivamente
 * através do Universal Event Bus.
 *
 * O barramento conhece apenas: Eventos, Contratos, Assinaturas.
 * NÃO conhece Engines, Connectors ou domínio da aplicação.
 *
 * NÃO utiliza: IA, HTTP, WebSocket, Banco de Dados, APIs externas,
 * OAuth, SDKs, Threads, Workers, Filas distribuídas.
 * Toda implementação é local, determinística e independente de infraestrutura.
 */

import {
  buildEvent,
  buildSubscription,
  PRIORITIES,
  PRIORITY_WEIGHTS,
  EVENT_STATUSES,
  _resetIdsForTests,
} from "./eventBusContracts.js";
import { createPriorityScheduler } from "./priorityScheduler.js";
import { createSubscriptionRegistry } from "./subscriptionRegistry.js";
import { createRetryManager } from "./retryManager.js";
import { createDeadLetterQueue } from "./deadLetterQueue.js";
import { createEventHistory } from "./eventHistory.js";
import { createStatistics } from "./statistics.js";

export function createEventBus() {
  const _scheduler = createPriorityScheduler();
  const _registry = createSubscriptionRegistry();
  const _retryManager = createRetryManager();
  const _deadLetterQueue = createDeadLetterQueue();
  const _history = createEventHistory();
  const _stats = createStatistics();

  const _subscriptions = new Map(); // subscriptionId -> subscription
  const _byEventType = new Map(); // eventType -> Set<subscriptionId>
  const _inFlight = new Map(); // eventId -> { event, subscribers, deliveredAt }
  const _scheduled = new Map(); // eventId -> { event, deliverAt }

  // === Internal helpers ===

  function _findSubscribers(eventType) {
    const ids = _byEventType.get(eventType);
    if (!ids) return [];
    const result = [];
    for (const id of ids) {
      const sub = _subscriptions.get(id);
      if (sub && sub.active && !sub.paused) result.push(sub);
    }
    return result;
  }

  function _dispatchScheduled() {
    const now = new Date().toISOString();
    const due = [];
    for (const [eventId, entry] of _scheduled) {
      if (entry.deliverAt <= now) due.push(eventId);
    }
    for (const eventId of due) {
      const entry = _scheduled.get(eventId);
      _scheduled.delete(eventId);
      _scheduler.enqueue(entry.event);
      _stats.inc("queuedEvents");
      _history.record(eventId, "published", "scheduled event delivered");
    }
  }

  // === Publishing ===

  function publish(eventData, publisherName) {
    const event = buildEvent(eventData);
    _history.record(event.eventId, "received", publisherName ? `from ${publisherName}` : "");
    _scheduler.enqueue(event);
    _stats.inc("publishedEvents");
    _stats.inc("queuedEvents");
    _history.record(event.eventId, "published");
    return event;
  }

  function publishBatch(events, publisherName) {
    if (!Array.isArray(events)) return [];
    const published = [];
    for (const ed of events) {
      published.push(publish(ed, publisherName));
    }
    return published;
  }

  function schedule(eventData, delayMs, publisherName) {
    const event = buildEvent(eventData);
    const deliverAt = new Date(Date.now() + (delayMs || 0)).toISOString();
    _scheduled.set(event.eventId, Object.freeze({ event, deliverAt }));
    _history.record(event.eventId, "received", publisherName ? `from ${publisherName}` : "");
    _history.record(event.eventId, "scheduled", `deliver at ${deliverAt}`);
    _stats.inc("publishedEvents");
    return event;
  }

  function cancel(eventId) {
    if (_scheduled.has(eventId)) {
      _scheduled.delete(eventId);
      _history.record(eventId, "discarded", "cancelled");
      return true;
    }
    return false;
  }

  function retry(eventId) {
    const inflight = _inFlight.get(eventId);
    if (inflight) {
      _inFlight.delete(eventId);
      const rec = _retryManager.retry(inflight.event);
      _stats.inc("retryEvents");
      _history.record(eventId, "retried", `attempt ${rec.attempt}`);
      _scheduler.enqueue(inflight.event);
      _stats.inc("queuedEvents");
      return Object.freeze({ action: "retried", record: rec });
    }
    return null;
  }

  function discard(eventId) {
    const inflight = _inFlight.get(eventId);
    if (inflight) {
      _inFlight.delete(eventId);
      _history.record(eventId, "discarded");
      _stats.inc("discardedEvents");
      return inflight.event;
    }
    return null;
  }

  // === Subscriptions ===

  function subscribe(consumerName, eventType, metadata) {
    const sub = buildSubscription({ consumerName, eventType, metadata });
    _subscriptions.set(sub.subscriptionId, sub);
    if (!_byEventType.has(eventType)) _byEventType.set(eventType, new Set());
    _byEventType.get(eventType).add(sub.subscriptionId);
    _stats.inc("subscriptions");
    return sub;
  }

  function unsubscribe(subscriptionId) {
    const sub = _subscriptions.get(subscriptionId);
    if (!sub) return false;
    _subscriptions.delete(subscriptionId);
    const set = _byEventType.get(sub.eventType);
    if (set) set.delete(subscriptionId);
    _stats.dec("subscriptions");
    return true;
  }

  function pauseSubscription(subscriptionId) {
    const sub = _subscriptions.get(subscriptionId);
    if (!sub) return null;
    const updated = Object.freeze({ ...sub, paused: true });
    _subscriptions.set(subscriptionId, updated);
    return updated;
  }

  function resumeSubscription(subscriptionId) {
    const sub = _subscriptions.get(subscriptionId);
    if (!sub) return null;
    const updated = Object.freeze({ ...sub, paused: false });
    _subscriptions.set(subscriptionId, updated);
    return updated;
  }

  // === Consumption ===

  function consume() {
    _dispatchScheduled();
    const event = _scheduler.next();
    if (!event) return null;

    const subscribers = _findSubscribers(event.eventType);
    const subscriberNames = subscribers.map((s) => s.consumerName);

    if (subscribers.length === 0) {
      _history.record(event.eventId, "processed", "no subscribers");
      _stats.inc("processedEvents");
      return Object.freeze({ event, subscribers: [] });
    }

    _history.record(event.eventId, "published", `to ${subscriberNames.join(", ")}`);
    _inFlight.set(event.eventId, Object.freeze({
      event,
      subscribers: subscriberNames,
      deliveredAt: new Date().toISOString(),
    }));
    return Object.freeze({ event, subscribers: subscriberNames });
  }

  function ack(eventId) {
    const inflight = _inFlight.get(eventId);
    if (!inflight) return false;
    _history.record(eventId, "processed");
    _stats.inc("processedEvents");
    _inFlight.delete(eventId);
    return true;
  }

  function nack(eventId) {
    const inflight = _inFlight.get(eventId);
    if (!inflight) return null;
    _inFlight.delete(eventId);

    const rec = _retryManager.retry(inflight.event);
    _stats.inc("retryEvents");
    _history.record(eventId, "retried", `attempt ${rec.attempt}/${rec.maxAttempts}`);

    if (_retryManager.shouldDiscard(eventId)) {
      _deadLetterQueue.send(inflight.event, "max_retries_exceeded");
      _stats.inc("deadLetterEvents");
      _stats.inc("discardedEvents");
      _history.record(eventId, "failed", "max retries exceeded");
      _history.record(eventId, "discarded", "sent to DLQ");
      return Object.freeze({ action: "dead_lettered", record: rec });
    }

    _scheduler.enqueue(inflight.event);
    _stats.inc("queuedEvents");
    return Object.freeze({ action: "retried", record: rec });
  }

  // === DLQ ===

  function restore(eventId) {
    const event = _deadLetterQueue.restore(eventId);
    if (!event) return null;
    _retryManager.clearAttempt(eventId);
    _history.record(eventId, "restored", "from DLQ");
    _scheduler.enqueue(event);
    _stats.inc("queuedEvents");
    return event;
  }

  // === Registration ===

  function registerPublisher(name, metadata) {
    const p = _registry.register("publisher", name, metadata);
    if (p) _stats.inc("publishers");
    return p;
  }

  function registerConsumer(name, metadata) {
    const p = _registry.register("consumer", name, metadata);
    if (p) _stats.inc("consumers");
    return p;
  }

  // === Stats ===

  function getStats() {
    _stats.setQueueSizes(_scheduler.queueSizes());
    return _stats.snapshot();
  }

  function describeStatistics() {
    _stats.setQueueSizes(_scheduler.queueSizes());
    return _stats.describeStatistics();
  }

  function describe() {
    const stats = getStats();
    const lines = [
      "Universal Event Bus — Status",
      `  Published: ${stats.publishedEvents}`,
      `  Processed: ${stats.processedEvents}`,
      `  Queued: ${stats.queuedEvents}`,
      `  Retries: ${stats.retryEvents}`,
      `  Discarded: ${stats.discardedEvents}`,
      `  Dead Letter: ${stats.deadLetterEvents}`,
      `  Subscriptions: ${stats.subscriptions}`,
      `  Queue Sizes: ${JSON.stringify(stats.queueSizes)}`,
      `  In Flight: ${_inFlight.size}`,
      `  Scheduled: ${_scheduled.size}`,
    ];
    return lines.join("\n");
  }

  // === Reset ===

  function reset() {
    _scheduler.clear();
    _registry.reset();
    _retryManager.reset();
    _deadLetterQueue.clear();
    _history.clear();
    _stats.resetStatistics();
    _subscriptions.clear();
    _byEventType.clear();
    _inFlight.clear();
    _scheduled.clear();
    _resetIdsForTests();
  }

  return Object.freeze({
    // Core components
    scheduler: _scheduler,
    registry: _registry,
    retryManager: _retryManager,
    deadLetterQueue: _deadLetterQueue,
    history: _history,
    statistics: _stats,

    // Publishing
    publish,
    publishBatch,
    schedule,
    cancel,
    retry,
    discard,

    // Subscriptions
    subscribe,
    unsubscribe,
    pauseSubscription,
    resumeSubscription,

    // Consumption
    consume,
    ack,
    nack,

    // DLQ
    restore,

    // Registration
    registerPublisher,
    registerConsumer,

    // Stats
    getStats,
    describeStatistics,
    describe,

    // Reset
    reset,

    // Constants
    priorities: () => [...PRIORITIES],
    statuses: () => [...EVENT_STATUSES],
  });
}