/**
 * Connector Builder (Sprint 29)
 *
 * Builder determinístico para criar Connectors.
 *
 * API:
 *   create()         — inicia nova construção
 *   set(key, value)  — define propriedade
 *   clone()          — clona builder atual
 *   validate()       — valida dados parciais
 *   freeze()         — retorna manifesto congelado
 *   build()          — constrói e retorna connector + manifest
 */

import { buildManifest } from "./connectorManifest.js";
import { BaseConnector } from "./baseConnector.js";

function _validateData(data) {
  const errors = [];
  if (!data.connectorName) errors.push("connectorName is required");
  if (!data.connectorVersion) errors.push("connectorVersion is required");
  return { valid: errors.length === 0, errors };
}

export function createConnectorBuilder(initialData) {
  let _data = initialData ? { ...initialData } : {};

  return Object.freeze({
    create() {
      _data = {};
      return this;
    },

    set(key, value) {
      _data[key] = value;
      return this;
    },

    setName(name) {
      _data.connectorName = name;
      return this;
    },

    setVendor(vendor) {
      _data.vendor = vendor;
      return this;
    },

    setDescription(description) {
      _data.description = description;
      return this;
    },

    setCategory(category) {
      _data.category = category;
      return this;
    },

    setVersion(version) {
      _data.connectorVersion = version;
      return this;
    },

    setTags(tags) {
      _data.tags = Array.isArray(tags) ? [...tags] : [];
      return this;
    },

    setPermissions(permissions) {
      _data.permissions = Array.isArray(permissions) ? [...permissions] : [];
      return this;
    },

    setSupportedEvents(events) {
      _data.supportedEvents = Array.isArray(events) ? [...events] : [];
      return this;
    },

    setSupportedActions(actions) {
      _data.supportedActions = Array.isArray(actions) ? [...actions] : [];
      return this;
    },

    setSupportedCapabilities(capabilities) {
      _data.supportedCapabilities = Array.isArray(capabilities) ? [...capabilities] : [];
      return this;
    },

    setMetadata(metadata) {
      _data.metadata = metadata && typeof metadata === "object" ? { ...metadata } : {};
      return this;
    },

    setMinimumMemoryOSVersion(version) {
      _data.minimumMemoryOSVersion = version;
      return this;
    },

    clone() {
      return createConnectorBuilder({ ..._data });
    },

    validate() {
      return _validateData(_data);
    },

    freeze(data) {
      return buildManifest(data || _data);
    },

    build(ConnectorClass) {
      const v = _validateData(_data);
      if (!v.valid) {
        return { ok: false, errors: v.errors, manifest: null, connector: null };
      }
      const manifest = buildManifest(_data);
      const Klass = ConnectorClass || BaseConnector;
      const connector = new Klass(manifest);
      return { ok: true, errors: [], manifest, connector };
    },

    data() {
      return { ..._data };
    },
  });
}