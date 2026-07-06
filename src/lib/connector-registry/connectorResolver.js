/**
 * Connector Resolver (Sprint 30)
 *
 * Resolução de Connectors, Capacidades e Compatibilidade.
 *
 * resolveConnector()    — O(1)
 * resolveCapability()   — O(1)
 * resolveCompatibility() — O(1)
 */

import { deepFreeze, SDK_VERSION } from "./registryContracts.js";
import { hasCapability } from "./connectorCapabilities.js";
import { checkSdkCompatibility, checkMemoryOSCompatibility } from "./connectorCompatibility.js";

export function createConnectorResolver({ registry, statistics }) {
  if (!registry || typeof registry._get !== "function") {
    throw new Error("createConnectorResolver requires a registry");
  }

  function _trackQuery() {
    if (statistics) statistics.inc("connectorQueries");
  }

  return Object.freeze({
    resolveConnector(connectorId) {
      _trackQuery();
      const connector = registry._get(connectorId);
      if (!connector) return null;
      return deepFreeze({
        ...connector,
        resolved: true,
        resolvedAt: new Date().toISOString(),
      });
    },

    resolveCapability(connectorId, capability) {
      _trackQuery();
      const connector = registry._get(connectorId);
      if (!connector) {
        return deepFreeze({
          resolved: false,
          connectorId: connectorId || "",
          capability: capability || "",
          hasCapability: false,
          error: `connector not found: ${connectorId}`,
        });
      }
      return deepFreeze({
        resolved: true,
        connectorId: connector.connectorId,
        capability,
        hasCapability: hasCapability(connector, capability),
      });
    },

    resolveCompatibility(connectorId, config = {}) {
      _trackQuery();
      const connector = registry._get(connectorId);
      if (!connector) {
        return deepFreeze({
          resolved: false,
          compatible: false,
          sdkCompatible: false,
          memoryOSCompatible: false,
          connectorId: connectorId || "",
          error: `connector not found: ${connectorId}`,
        });
      }

      const targetSdk = config.sdkVersion || SDK_VERSION;
      const targetMOS = config.memoryOSVersion || "1.0.0";

      const sdkOk = checkSdkCompatibility(connector, targetSdk);
      const mosOk = checkMemoryOSCompatibility(connector, targetMOS);

      return deepFreeze({
        resolved: true,
        connectorId: connector.connectorId,
        compatible: sdkOk && mosOk,
        sdkCompatible: sdkOk,
        memoryOSCompatible: mosOk,
        targetSdkVersion: targetSdk,
        targetMemoryOSVersion: targetMOS,
      });
    },
  });
}