/**
 * Connector Search (Sprint 30)
 *
 * Pesquisa e localização de Connectors por diversos critérios.
 * Utiliza indexação lógica do registry para O(1) + O(k) lookups.
 *
 * findById()        — O(1)
 * findByVendor()    — O(1) + O(k)
 * findByCategory()  — O(1) + O(k)
 * findByCapability() — O(1) + O(k)
 * findByPermission() — O(1) + O(k)
 * findByTag()       — O(1) + O(k)
 * findByType()      — O(1) + O(k)
 * search()          — O(n) (substring text search)
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
      return deepFreeze(registry._getByVendor(vendor));
    },

    findByCategory(category) {
      if (typeof category !== "string") return deepFreeze([]);
      return deepFreeze(registry._getByCategory(category));
    },

    findByCapability(capability) {
      if (typeof capability !== "string") return deepFreeze([]);
      return deepFreeze(registry._getByCapability(capability));
    },

    findByPermission(permission) {
      if (typeof permission !== "string") return deepFreeze([]);
      return deepFreeze(registry._getByPermission(permission));
    },

    findByTag(tag) {
      if (typeof tag !== "string") return deepFreeze([]);
      return deepFreeze(registry._getByTag(tag));
    },

    findByType(type) {
      if (typeof type !== "string") return deepFreeze([]);
      return deepFreeze(registry._getByType(type));
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