/**
 * Connector Registry (Sprint 30)
 *
 * Armazenamento e gerenciamento de Connectors com indexação lógica.
 *
 * register()        — O(1)
 * registerBatch()   — O(k) where k = configs.length
 * unregister()      — O(1) + index cleanup
 * unregisterBatch() — O(k)
 * update()          — O(1) + index rebuild
 * exists()          — O(1)
 * reset()           — O(n)
 *
 * Utiliza Map + Set internamente para lookup O(1) por índice.
 */

import { buildConnectorRecord, deepFreeze } from "./registryContracts.js";

export function createConnectorRegistry(statistics) {
  const _byConnectorId = new Map();
  const _byRegistrationId = new Map();
  const _byVendor = new Map();
  const _byCategory = new Map();
  const _byType = new Map();
  const _byCapability = new Map();
  const _byPermission = new Map();
  const _byTag = new Map();

  function _addToIndex(indexMap, key, connectorId) {
    if (!indexMap.has(key)) indexMap.set(key, new Set());
    indexMap.get(key).add(connectorId);
  }

  function _removeFromIndex(indexMap, key, connectorId) {
    const set = indexMap.get(key);
    if (set) {
      set.delete(connectorId);
      if (set.size === 0) indexMap.delete(key);
    }
  }

  function _addToIndices(record) {
    _addToIndex(_byVendor, record.vendor, record.connectorId);
    _addToIndex(_byCategory, record.category, record.connectorId);
    _addToIndex(_byType, record.connectorType, record.connectorId);
    for (const cap of record.supportedCapabilities) _addToIndex(_byCapability, cap, record.connectorId);
    for (const perm of record.permissions) _addToIndex(_byPermission, perm, record.connectorId);
    for (const tag of record.tags) _addToIndex(_byTag, tag, record.connectorId);
  }

  function _removeFromIndices(record) {
    _removeFromIndex(_byVendor, record.vendor, record.connectorId);
    _removeFromIndex(_byCategory, record.category, record.connectorId);
    _removeFromIndex(_byType, record.connectorType, record.connectorId);
    for (const cap of record.supportedCapabilities) _removeFromIndex(_byCapability, cap, record.connectorId);
    for (const perm of record.permissions) _removeFromIndex(_byPermission, perm, record.connectorId);
    for (const tag of record.tags) _removeFromIndex(_byTag, tag, record.connectorId);
  }

  function _resolveIds(idSet) {
    const result = [];
    for (const id of idSet) {
      const c = _byConnectorId.get(id);
      if (c) result.push(c);
    }
    return result;
  }

  function _updateStatsRegister(record) {
    if (!statistics) return;
    statistics.inc("registeredConnectors");
    statistics.incCategory(record.category);
    statistics.incType(record.connectorType);
    if (record.status === "ACTIVE") statistics.inc("activeConnectors");
  }

  function _updateStatsUnregister(record) {
    if (!statistics) return;
    statistics.dec("registeredConnectors");
    statistics.decCategory(record.category);
    statistics.decType(record.connectorType);
    if (record.status === "ACTIVE") statistics.dec("activeConnectors");
  }

  function _updateStatsUpdate(oldRecord, newRecord) {
    if (!statistics) return;
    if (oldRecord.status === "ACTIVE" && newRecord.status !== "ACTIVE") statistics.dec("activeConnectors");
    if (oldRecord.status !== "ACTIVE" && newRecord.status === "ACTIVE") statistics.inc("activeConnectors");
    if (oldRecord.category !== newRecord.category) {
      statistics.decCategory(oldRecord.category);
      statistics.incCategory(newRecord.category);
    }
    if (oldRecord.connectorType !== newRecord.connectorType) {
      statistics.decType(oldRecord.connectorType);
      statistics.incType(newRecord.connectorType);
    }
  }

  return Object.freeze({
    register(config) {
      if (!config || typeof config !== "object") {
        return { success: false, error: "config is required", connector: null };
      }
      if (config.connectorId && _byConnectorId.has(config.connectorId)) {
        return { success: false, error: `connector already registered: ${config.connectorId}`, connector: null };
      }
      let record;
      try {
        record = buildConnectorRecord(config);
      } catch (e) {
        return { success: false, error: e.message, connector: null };
      }
      _byConnectorId.set(record.connectorId, record);
      _byRegistrationId.set(record.registrationId, record);
      _addToIndices(record);
      _updateStatsRegister(record);
      return { success: true, error: null, connector: record };
    },

    registerBatch(configs) {
      if (!Array.isArray(configs)) {
        return { success: false, results: [], successCount: 0, failureCount: 0 };
      }
      const results = configs.map((config) => this.register(config));
      const successCount = results.filter((r) => r.success).length;
      return {
        success: successCount === configs.length,
        results,
        successCount,
        failureCount: configs.length - successCount,
      };
    },

    unregister(connectorId) {
      if (!connectorId) return { success: false, error: "connectorId is required" };
      const existing = _byConnectorId.get(connectorId);
      if (!existing) return { success: false, error: `connector not found: ${connectorId}` };
      _removeFromIndices(existing);
      _byConnectorId.delete(connectorId);
      _byRegistrationId.delete(existing.registrationId);
      _updateStatsUnregister(existing);
      return { success: true, error: null };
    },

    unregisterBatch(connectorIds) {
      if (!Array.isArray(connectorIds)) {
        return { success: false, results: [], successCount: 0, failureCount: 0 };
      }
      const results = connectorIds.map((id) => this.unregister(id));
      const successCount = results.filter((r) => r.success).length;
      return {
        success: successCount === connectorIds.length,
        results,
        successCount,
        failureCount: connectorIds.length - successCount,
      };
    },

    update(connectorId, updates = {}) {
      if (!connectorId) return { success: false, error: "connectorId is required", connector: null };
      const existing = _byConnectorId.get(connectorId);
      if (!existing) return { success: false, error: `connector not found: ${connectorId}`, connector: null };
      const updated = deepFreeze({
        ...existing,
        ...updates,
        registrationId: existing.registrationId,
        connectorId: existing.connectorId,
        registeredAt: existing.registeredAt,
      });
      _removeFromIndices(existing);
      _byConnectorId.set(connectorId, updated);
      _byRegistrationId.set(existing.registrationId, updated);
      _addToIndices(updated);
      _updateStatsUpdate(existing, updated);
      return { success: true, error: null, connector: updated };
    },

    exists(connectorId) {
      return _byConnectorId.has(connectorId);
    },

    reset() {
      _byConnectorId.clear();
      _byRegistrationId.clear();
      _byVendor.clear();
      _byCategory.clear();
      _byType.clear();
      _byCapability.clear();
      _byPermission.clear();
      _byTag.clear();
      return { success: true, cleared: true };
    },

    _get(connectorId) { return _byConnectorId.get(connectorId) || null; },
    _getByRegistrationId(regId) { return _byRegistrationId.get(regId) || null; },
    _all() { return [..._byConnectorId.values()]; },
    _count() { return _byConnectorId.size; },
    _getByVendor(vendor) { const s = _byVendor.get(vendor); return s ? _resolveIds(s) : []; },
    _getByCategory(cat) { const s = _byCategory.get(cat); return s ? _resolveIds(s) : []; },
    _getByType(type) { const s = _byType.get(type); return s ? _resolveIds(s) : []; },
    _getByCapability(cap) { const s = _byCapability.get(cap); return s ? _resolveIds(s) : []; },
    _getByPermission(perm) { const s = _byPermission.get(perm); return s ? _resolveIds(s) : []; },
    _getByTag(tag) { const s = _byTag.get(tag); return s ? _resolveIds(s) : []; },
  });
}