/**
 * Connector Lookup (Sprint 30)
 *
 * Consulta de Connectors, Capacidades e Compatibilidade.
 *
 * O Lookup APENAS consulta.
 * Jamais toma decisões sobre qual Connector utilizar.
 *
 * getConnector()    — O(1)
 * getCapability()   — O(1)
 * getCompatibility() — O(1)
 */

import { CAPABILITIES, SDK_VERSION, deepFreeze } from "./registryContracts.js";
import { checkSdkCompatibility, checkMemoryOSCompatibility } from "./connectorCompatibility.js";

// === Standalone Capability Helpers ===

export function hasCapability(connector, capability) {
  if (!connector || !Array.isArray(connector.supportedCapabilities)) return false;
  if (typeof capability !== "string") return false;
  return connector.supportedCapabilities.includes(capability);
}

export function getCapabilities(connector) {
  if (!connector || !Array.isArray(connector.supportedCapabilities)) return deepFreeze([]);
  return deepFreeze([...connector.supportedCapabilities]);
}

export function listCapabilities() {
  return deepFreeze([...CAPABILITIES]);
}

export function isCapability(capability) {
  return CAPABILITIES.includes(capability);
}

// === Lookup Factory ===

export function createConnectorLookup({ registry, statistics }) {
  if (!registry || typeof registry._get !== "function") {
    throw new Error("createConnectorLookup requires a registry");
  }

  function _trackQuery() {
    if (statistics) statistics.inc("connectorQueries");
  }

  return Object.freeze({
    getConnector(connectorId) {
      _trackQuery();
      const connector = registry._get(connectorId);
      if (!connector) {
        return deepFreeze({ found: false, connectorId: connectorId || "", connector: null });
      }
      return deepFreeze({ found: true, connectorId: connector.connectorId, connector });
    },

    getCapability(connectorId, capability) {
      _trackQuery();
      const connector = registry._get(connectorId);
      if (!connector) {
        return deepFreeze({
          found: false,
          connectorId: connectorId || "",
          capability: capability || "",
          hasCapability: false,
        });
      }
      return deepFreeze({
        found: true,
        connectorId: connector.connectorId,
        capability,
        hasCapability: hasCapability(connector, capability),
      });
    },

    getCompatibility(connectorId, config = {}) {
      _trackQuery();
      const connector = registry._get(connectorId);
      if (!connector) {
        return deepFreeze({
          found: false,
          connectorId: connectorId || "",
          sdkCompatible: false,
          memoryOSCompatible: false,
        });
      }

      const targetSdk = config.sdkVersion || SDK_VERSION;
      const targetMOS = config.memoryOSVersion || "1.0.0";

      return deepFreeze({
        found: true,
        connectorId: connector.connectorId,
        sdkCompatible: checkSdkCompatibility(connector, targetSdk),
        memoryOSCompatible: checkMemoryOSCompatibility(connector, targetMOS),
        targetSdkVersion: targetSdk,
        targetMemoryOSVersion: targetMOS,
      });
    },
  });
}