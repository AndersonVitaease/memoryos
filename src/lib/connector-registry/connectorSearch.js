/**
 * Connector Search (Sprint 30)
 *
 * Pesquisa e localização de Connectors por diversos critérios.
 *
 * findById()        — O(1)
 * findByVendor()     — O(n)
 * findByCategory()   — O(n)
 * findByCapability() — O(n)
 * findByPermission() — O(n)
 * search()           — O(n)
 */

import { deepFreeze } from "./registryContracts.js";

export function createConnectorSearch(registry) {
  if (!registry || typeof registry._all !== "function") {
    throw new Error("createConnectorSearch requires a registry");
  }

  return Object.freeze({
    findById(connectorId) {
      return registry._get(connectorId);
    },

    findByVendor(vendor) {
      if (typeof vendor !== "string") return deepFreeze([]);
      return deepFreeze(
        registry._all().filter((c) => c.vendor === vendor)
      );
    },

    findByCategory(category) {
      if (typeof category !== "string") return deepFreeze([]);
      return deepFreeze(
        registry._all().filter((c) => c.category === category)
      );
    },

    findByCapability(capability) {
      if (typeof capability !== "string") return deepFreeze([]);
      return deepFreeze(
        registry._all().filter((c) => c.supportedCapabilities.includes(capability))
      );
    },

    findByPermission(permission) {
      if (typeof permission !== "string") return deepFreeze([]);
      return deepFreeze(
        registry._all().filter((c) => c.permissions.includes(permission))
      );
    },

    search(query) {
      const all = registry._all();
      if (typeof query !== "string" || query.length === 0) return deepFreeze([]);
      const q = query.toLowerCase();
      return deepFreeze(
        all.filter((c) =>
          c.connectorName.toLowerCase().includes(q) ||
          c.vendor.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
        )
      );
    },
  });
}