/**
 * Connector Registry (Sprint 30)
 *
 * Armazenamento e gerenciamento de Connectors.
 *
 * register()     — O(1)
 * unregister()   — O(1)
 * update()       — O(1)
 * exists()       — O(1)
 * reset()        — O(n)
 *
 * Internamente usa Map para lookup O(1) por connectorId.
 */

import { buildConnectorRecord, deepFreeze } from "./registryContracts.js";

export function createConnectorRegistry() {
  const _byConnectorId = new Map();
  const _byRegistrationId = new Map();

  function _store(record) {
    _byConnectorId.set(record.connectorId, record);
    _byRegistrationId.set(record.registrationId, record);
  }

  return Object.freeze({
    register(config) {
      if (!config || typeof config !== "object") {
        return { success: false, error: "config is required", connector: null };
      }

      if (config.connectorId && _byConnectorId.has(config.connectorId)) {
        return {
          success: false,
          error: `connector already registered: ${config.connectorId}`,
          connector: null,
        };
      }

      let record;
      try {
        record = buildConnectorRecord(config);
      } catch (e) {
        return { success: false, error: e.message, connector: null };
      }

      _store(record);
      return { success: true, error: null, connector: record };
    },

    unregister(connectorId) {
      if (!connectorId) {
        return { success: false, error: "connectorId is required" };
      }
      const existing = _byConnectorId.get(connectorId);
      if (!existing) {
        return { success: false, error: `connector not found: ${connectorId}` };
      }
      _byConnectorId.delete(connectorId);
      _byRegistrationId.delete(existing.registrationId);
      return { success: true, error: null };
    },

    update(connectorId, updates = {}) {
      if (!connectorId) {
        return { success: false, error: "connectorId is required", connector: null };
      }
      const existing = _byConnectorId.get(connectorId);
      if (!existing) {
        return { success: false, error: `connector not found: ${connectorId}`, connector: null };
      }

      const updated = deepFreeze({
        ...existing,
        ...updates,
        registrationId: existing.registrationId,
        connectorId: existing.connectorId,
        registeredAt: existing.registeredAt,
      });

      _byConnectorId.set(connectorId, updated);
      _byRegistrationId.set(existing.registrationId, updated);
      return { success: true, error: null, connector: updated };
    },

    exists(connectorId) {
      return _byConnectorId.has(connectorId);
    },

    reset() {
      _byConnectorId.clear();
      _byRegistrationId.clear();
      return { success: true, cleared: true };
    },

    // Internal access for catalog/search/resolver
    _get(connectorId) {
      return _byConnectorId.get(connectorId) || null;
    },

    _getByRegistrationId(registrationId) {
      return _byRegistrationId.get(registrationId) || null;
    },

    _all() {
      return [..._byConnectorId.values()];
    },

    _count() {
      return _byConnectorId.size;
    },
  });
}