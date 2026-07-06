/**
 * Connector Catalog (Sprint 30)
 *
 * Visualização e listagem de Connectors registrados.
 *
 * list()     — O(n)
 * count()    — O(1)
 * get()      — O(1)
 * describe() — O(n)
 */

import { deepFreeze } from "./registryContracts.js";

export function createConnectorCatalog(registry) {
  if (!registry || typeof registry._all !== "function") {
    throw new Error("createConnectorCatalog requires a registry");
  }

  return Object.freeze({
    list() {
      return deepFreeze([...registry._all()]);
    },

    count() {
      return registry._count();
    },

    get(connectorId) {
      return registry._get(connectorId);
    },

    describe() {
      const all = registry._all();
      const lines = [
        "Connector Registry — Catalog",
        `  Total Connectors: ${all.length}`,
      ];

      if (all.length > 0) {
        const byStatus = {};
        const byHealth = {};
        for (const c of all) {
          byStatus[c.status] = (byStatus[c.status] || 0) + 1;
          byHealth[c.health] = (byHealth[c.health] || 0) + 1;
        }
        lines.push("  By Status:");
        for (const [status, count] of Object.entries(byStatus)) {
          lines.push(`    ${status}: ${count}`);
        }
        lines.push("  By Health:");
        for (const [health, count] of Object.entries(byHealth)) {
          lines.push(`    ${health}: ${count}`);
        }
        lines.push("  Connectors:");
        for (const c of all) {
          lines.push(`    [${c.connectorId}] ${c.connectorName} v${c.connectorVersion} (${c.vendor})`);
        }
      }

      return lines.join("\n");
    },
  });
}