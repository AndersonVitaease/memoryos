/**
 * Statistics (Sprint 30)
 *
 * Contadores de observabilidade do Connector Registry.
 *
 * registeredConnectors, activeConnectors, compatibleConnectors,
 * incompatibleConnectors, connectorQueries
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

  return Object.freeze({
    inc(key, amount = 1) {
      if (key in _counters) _counters[key] += amount;
    },
    dec(key, amount = 1) {
      if (key in _counters) _counters[key] -= amount;
    },
    get(key) {
      return key in _counters ? _counters[key] : 0;
    },
    snapshot() {
      return { ..._counters };
    },
    resetStatistics() {
      for (const k of Object.keys(_counters)) _counters[k] = 0;
    },
    describeStatistics() {
      const s = { ..._counters };
      const lines = [
        "Connector Registry — Statistics",
        `  Registered Connectors: ${s.registeredConnectors}`,
        `  Active Connectors: ${s.activeConnectors}`,
        `  Compatible Connectors: ${s.compatibleConnectors}`,
        `  Incompatible Connectors: ${s.incompatibleConnectors}`,
        `  Connector Queries: ${s.connectorQueries}`,
      ];
      return lines.join("\n");
    },
  });
}