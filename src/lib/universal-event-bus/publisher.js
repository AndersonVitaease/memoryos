/**
 * Publisher (Sprint 28)
 *
 * Fachada sobre o Universal Event Bus para publicação de eventos.
 * NÃO conhece Consumers. Apenas publica no barramento.
 */

export function createPublisher(bus, name) {
  if (!bus || typeof bus.publish !== "function") {
    throw new Error("a valid event bus is required");
  }
  if (!name || typeof name !== "string") {
    throw new Error("publisher name is required");
  }

  bus.registerPublisher(name);

  return Object.freeze({
    name,
    publish(eventData) {
      return bus.publish(eventData, name);
    },
    publishBatch(events) {
      return bus.publishBatch(events, name);
    },
    schedule(eventData, delayMs) {
      return bus.schedule(eventData, delayMs, name);
    },
    cancel(eventId) {
      return bus.cancel(eventId);
    },
    retry(eventId) {
      return bus.retry(eventId);
    },
    discard(eventId) {
      return bus.discard(eventId);
    },
  });
}