/**
 * Statistics (Sprint 30)
 *
 * Contadores de observabilidade do Connector Registry.
 * As estatísticas são somente leitura (snapshots retornam cópias).
 *
 * registeredConnectors, activeConnectors, compatibleConnectors,
 * incompatibleConnectors, connectorQueries,
 * registeredByCategory, registeredByType
 *
 * + resetStatistics(), describeStatistics()
 */

export function createStatistics() {
  const _counters = {
    registeredConnectors: 0,
    activeConnectors: 0,
    compatibleConnectors: 0,
    incompatibleConnectors: 0,
    connectorQueries: 0,
  };
  const _byCategory = {};
  const _byType = {};

  return Object.freeze({
    inc(key, amount = 1) {
      if (key in _counters) _counters[key] += amount;
    },
    dec(key, amount = 1) {
      if (key in _counters) _counters[key] -= amount;
    },
    incCategory(category, amount = 1) {
      if (typeof category !== "string") return;
      _byCategory[category] = (_byCategory[category] || 0) + amount;
    },
    decCategory(category, amount = 1) {
      if (typeof category !== "string") return;
      _byCategory[category] = (_byCategory[category] || 0) - amount;
      if (_byCategory[category] <= 0) delete _byCategory[category];
    },
    incType(type, amount = 1) {
      if (typeof type !== "string") return;
      _byType[type] = (_byType[type] || 0) + amount;
    },
    decType(type, amount = 1) {
      if (typeof type !== "string") return;
      _byType[type] = (_byType[type] || 0) - amount;
      if (_byType[type] <= 0) delete _byType[type];
    },
    get(key) {
      return key in _counters ? _counters[key] : 0;
    },
    getCategory(category) {
      return _byCategory[category] || 0;
    },
    getType(type) {
      return _byType[type] || 0;
    },
    snapshot() {
      return {
        ..._counters,
        registeredByCategory: { ..._byCategory },
        registeredByType: { ..._byType },
      };
    },
    resetStatistics() {
      for (const k of Object.keys(_counters)) _counters[k] = 0;
      for (const k of Object.keys(_byCategory)) delete _byCategory[k];
      for (const k of Object.keys(_byType)) delete _byType[k];
    },
    describeStatistics() {
      const snap = {
        ..._counters,
        registeredByCategory: { ..._byCategory },
        registeredByType: { ..._byType },
      };
      const lines = [
        "Connector Registry — Statistics",
        `  Registered Connectors: ${snap.registeredConnectors}`,
        `  Active Connectors: ${snap.activeConnectors}`,
        `  Compatible Connectors: ${snap.compatibleConnectors}`,
        `  Incompatible Connectors: ${snap.incompatibleConnectors}`,
        `  Connector Queries: ${snap.connectorQueries}`,
        "  By Category:",
        ...Object.entries(snap.registeredByCategory).map(([k, v]) => `    ${k}: ${v}`),
        "  By Type:",
        ...Object.entries(snap.registeredByType).map(([k, v]) => `    ${k}: ${v}`),
      ];
      return lines.join("\n");
    },
  });
}