/**
 * Connector Capabilities (Sprint 30)
 *
 * Resolução de capacidades de Connectors.
 *
 * hasCapability()    — O(n) where n = capabilities length
 * getCapabilities()  — O(n)
 * resolveCapability() — O(n)
 * listCapabilities() — O(1)
 */

import { CAPABILITIES, deepFreeze } from "./registryContracts.js";

export function hasCapability(connector, capability) {
  if (!connector || !Array.isArray(connector.supportedCapabilities)) return false;
  if (typeof capability !== "string") return false;
  return connector.supportedCapabilities.includes(capability);
}

export function getCapabilities(connector) {
  if (!connector || !Array.isArray(connector.supportedCapabilities)) return deepFreeze([]);
  return deepFreeze([...connector.supportedCapabilities]);
}

export function resolveCapability(connector, capability) {
  return deepFreeze({
    resolved: !!connector,
    connectorId: connector ? connector.connectorId : "",
    capability,
    hasCapability: hasCapability(connector, capability),
  });
}

export function listCapabilities() {
  return deepFreeze([...CAPABILITIES]);
}

export function isCapability(capability) {
  return CAPABILITIES.includes(capability);
}