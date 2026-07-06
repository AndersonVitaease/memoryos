/**
 * Statistics (Sprint 29)
 *
 * Contadores de observabilidade do Connector SDK.
 *
 *   loadedConnectors
 *   unloadedConnectors
 *   connectorErrors
 *   lifecycleTransitions
 *
 * + resetStatistics(), describeStatistics()
 */

export function createStatistics() {
  const _counters = {
    loadedConnectors: 0,
    unloadedConnectors: 0,
    connectorErrors: 0,
    lifecycleTransitions: 0,
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
      return [
        "Connector SDK — Statistics",
        `  Loaded Connectors: ${s.loadedConnectors}`,
        `  Unloaded Connectors: ${s.unloadedConnectors}`,
        `  Connector Errors: ${s.connectorErrors}`,
        `  Lifecycle Transitions: ${s.lifecycleTransitions}`,
      ].join("\n");
    },
  });
}