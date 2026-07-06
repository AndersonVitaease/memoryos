/**
 * Statistics (Sprint 27)
 *
 * Contadores de observabilidade para a Enterprise Integration Layer.
 */

export function createStatistics() {
  const _counters = {
    registeredConnectors: 0,
    activeConnectors: 0,
    disabledConnectors: 0,
    dispatchedEvents: 0,
    dispatchedActions: 0,
    permissionChecks: 0,
    failedEvents: 0,
    failedActions: 0,
  };

  const _validKeys = new Set(Object.keys(_counters));

  function inc(key, amount = 1) {
    if (!_validKeys.has(key)) return;
    _counters[key] += amount;
  }

  function dec(key, amount = 1) {
    if (!_validKeys.has(key)) return;
    _counters[key] = Math.max(0, _counters[key] - amount);
  }

  function get(key) {
    return _validKeys.has(key) ? _counters[key] : 0;
  }

  function snapshot() {
    return Object.freeze({ ..._counters });
  }

  function describeStatistics() {
    const lines = [
      "Enterprise Integration Layer — Statistics",
      `  Registered Connectors: ${_counters.registeredConnectors}`,
      `  Active Connectors: ${_counters.activeConnectors}`,
      `  Disabled Connectors: ${_counters.disabledConnectors}`,
      `  Dispatched Events: ${_counters.dispatchedEvents}`,
      `  Dispatched Actions: ${_counters.dispatchedActions}`,
      `  Permission Checks: ${_counters.permissionChecks}`,
      `  Failed Events: ${_counters.failedEvents}`,
      `  Failed Actions: ${_counters.failedActions}`,
    ];
    return lines.join("\n");
  }

  function resetStatistics() {
    for (const key of Object.keys(_counters)) {
      _counters[key] = 0;
    }
  }

  return Object.freeze({
    inc,
    dec,
    get,
    snapshot,
    describeStatistics,
    resetStatistics,
  });
}