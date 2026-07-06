/**
 * Event History (Sprint 28)
 *
 * Registra o ciclo de vida de cada evento:
 * received, published, scheduled, retried, processed, failed, discarded, restored.
 *
 * Histórico imutável. Cada entrada é Object.freeze().
 */

import { buildHistoryEntry, EVENT_STATUSES } from "./eventBusContracts.js";

export function createEventHistory() {
  const _entries = [];
  const _byEvent = new Map(); // eventId -> historyEntry[]

  return Object.freeze({
    record(eventId, status, detail) {
      const entry = buildHistoryEntry({ eventId, status, detail });
      _entries.push(entry);
      if (!_byEvent.has(eventId)) _byEvent.set(eventId, []);
      _byEvent.get(eventId).push(entry);
      return entry;
    },
    list() {
      return [..._entries];
    },
    getByEvent(eventId) {
      return _byEvent.has(eventId) ? [..._byEvent.get(eventId)] : [];
    },
    lastStatus(eventId) {
      const entries = _byEvent.get(eventId);
      if (!entries || entries.length === 0) return null;
      return entries[entries.length - 1].status;
    },
    count() {
      return _entries.length;
    },
    countByStatus(status) {
      return _entries.filter((e) => e.status === status).length;
    },
    statuses() {
      return [...EVENT_STATUSES];
    },
    clear() {
      _entries.length = 0;
      _byEvent.clear();
    },
  });
}