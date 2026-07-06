/**
 * Connector Filters (Sprint 30)
 *
 * Filtragem de Connectors por status e saúde.
 *
 * filterActive()      — O(n)
 * filterInactive()    — O(n)
 * filterConnected()   — O(n)
 * filterDisconnected() — O(n)
 * filterHealthy()     — O(n)
 * filterUnhealthy()   — O(n)
 * applyFilters()      — O(n * f)
 */

import { FILTER_TYPES, deepFreeze } from "./registryContracts.js";

function _filter(connectors, predicate) {
  if (!Array.isArray(connectors)) return deepFreeze([]);
  return deepFreeze(connectors.filter(predicate));
}

export function filterActive(connectors) {
  return _filter(connectors, (c) => c && c.status === "ACTIVE");
}

export function filterInactive(connectors) {
  return _filter(connectors, (c) => c && c.status === "INACTIVE");
}

export function filterConnected(connectors) {
  return _filter(connectors, (c) => c && c.status === "CONNECTED");
}

export function filterDisconnected(connectors) {
  return _filter(connectors, (c) => c && c.status === "DISCONNECTED");
}

export function filterHealthy(connectors) {
  return _filter(connectors, (c) => c && c.health === "HEALTHY");
}

export function filterUnhealthy(connectors) {
  return _filter(connectors, (c) => c && c.health === "UNHEALTHY");
}

export function applyFilters(connectors, filterTypes) {
  if (!Array.isArray(connectors)) return deepFreeze([]);
  if (!Array.isArray(filterTypes) || filterTypes.length === 0) return deepFreeze([...connectors]);

  let result = [...connectors];
  for (const ft of filterTypes) {
    if (!FILTER_TYPES.includes(ft)) continue;
    switch (ft) {
      case "ACTIVE": result = result.filter((c) => c.status === "ACTIVE"); break;
      case "INACTIVE": result = result.filter((c) => c.status === "INACTIVE"); break;
      case "CONNECTED": result = result.filter((c) => c.status === "CONNECTED"); break;
      case "DISCONNECTED": result = result.filter((c) => c.status === "DISCONNECTED"); break;
      case "HEALTHY": result = result.filter((c) => c.health === "HEALTHY"); break;
      case "UNHEALTHY": result = result.filter((c) => c.health === "UNHEALTHY"); break;
      default: break;
    }
  }
  return deepFreeze(result);
}

export function listFilterTypes() {
  return deepFreeze([...FILTER_TYPES]);
}