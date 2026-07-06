/**
 * Consumer (Sprint 28)
 *
 * Fachada sobre o Universal Event Bus para consumo de eventos.
 * Pode assinar múltiplos eventTypes.
 */

export function createConsumer(bus, name) {
  if (!bus || typeof bus.subscribe !== "function") {
    throw new Error("a valid event bus is required");
  }
  if (!name || typeof name !== "string") {
    throw new Error("consumer name is required");
  }

  bus.registerConsumer(name);
  const _subscriptionIds = [];

  return Object.freeze({
    name,
    subscribe(eventType, metadata) {
      const sub = bus.subscribe(name, eventType, metadata);
      _subscriptionIds.push(sub.subscriptionId);
      return sub;
    },
    unsubscribe(subscriptionId) {
      const idx = _subscriptionIds.indexOf(subscriptionId);
      if (idx >= 0) _subscriptionIds.splice(idx, 1);
      return bus.unsubscribe(subscriptionId);
    },
    pause(subscriptionId) {
      return bus.pauseSubscription(subscriptionId);
    },
    resume(subscriptionId) {
      return bus.resumeSubscription(subscriptionId);
    },
    consume() {
      return bus.consume();
    },
    ack(eventId) {
      return bus.ack(eventId);
    },
    nack(eventId) {
      return bus.nack(eventId);
    },
    subscriptions() {
      return [..._subscriptionIds];
    },
  });
}