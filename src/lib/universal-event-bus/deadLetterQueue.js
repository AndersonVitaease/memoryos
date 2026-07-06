/**
 * Dead Letter Queue (Sprint 28)
 *
 * Todo evento que ultrapassar o número máximo de tentativas
 * é enviado para a Dead Letter Queue.
 *
 * Implementa: list, restore, discard, clear.
 */

export function createDeadLetterQueue() {
  const _items = new Map(); // eventId -> { event, reason, sentAt }

  return Object.freeze({
    send(event, reason) {
      if (!event || !event.eventId) return false;
      _items.set(event.eventId, Object.freeze({
        event,
        reason: reason || "max_retries_exceeded",
        sentAt: new Date().toISOString(),
      }));
      return true;
    },
    list() {
      return [..._items.values()];
    },
    get(eventId) {
      return _items.get(eventId) || null;
    },
    restore(eventId) {
      const item = _items.get(eventId);
      if (!item) return null;
      _items.delete(eventId);
      return item.event;
    },
    discard(eventId) {
      return _items.delete(eventId);
    },
    clear() {
      _items.clear();
    },
    size() {
      return _items.size;
    },
    isEmpty() {
      return _items.size === 0;
    },
    has(eventId) {
      return _items.has(eventId);
    },
  });
}