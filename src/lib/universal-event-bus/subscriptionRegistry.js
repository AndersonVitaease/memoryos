/**
 * Subscription Registry (Sprint 28)
 *
 * Registra participantes do barramento:
 * Publishers, Consumers, Engines, Connectors, Future Services, Future Specialists.
 *
 * Não conhece a implementação de nenhum participante.
 * Apenas registra metadados para supervisão.
 */

import {
  buildParticipant,
  PARTICIPANT_KINDS,
} from "./eventBusContracts.js";

export function createSubscriptionRegistry() {
  const _entries = new Map(); // "kind:name" -> participant
  const _byKind = new Map(); // kind -> Map<name, participant>

  function _key(kind, name) {
    return `${kind}:${name}`;
  }

  return Object.freeze({
    register(kind, name, metadata) {
      if (!PARTICIPANT_KINDS.includes(kind)) return null;
      if (!name || typeof name !== "string") return null;

      const participant = buildParticipant({ kind, name, metadata });
      if (!_byKind.has(kind)) _byKind.set(kind, new Map());
      _byKind.get(kind).set(name, participant);
      _entries.set(_key(kind, name), participant);
      return participant;
    },
    remove(kind, name) {
      const key = _key(kind, name);
      if (!_entries.has(key)) return false;
      _entries.delete(key);
      const map = _byKind.get(kind);
      if (map) map.delete(name);
      return true;
    },
    exists(kind, name) {
      return _entries.has(_key(kind, name));
    },
    get(kind, name) {
      return _entries.get(_key(kind, name)) || null;
    },
    list(kind) {
      if (kind) {
        const map = _byKind.get(kind);
        return map ? [...map.values()] : [];
      }
      return [..._entries.values()];
    },
    count(kind) {
      if (kind) {
        const map = _byKind.get(kind);
        return map ? map.size : 0;
      }
      return _entries.size;
    },
    reset() {
      _entries.clear();
      _byKind.clear();
    },
    kinds() {
      return [...PARTICIPANT_KINDS];
    },
  });
}