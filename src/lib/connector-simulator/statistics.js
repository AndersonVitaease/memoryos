/**
 * Statistics (Sprint 30)
 *
 * Contadores de observabilidade do Connector Simulator.
 *
 * Implementa:
 *   executedScenarios, simulatedEvents, simulatedActions,
 *   simulatedFailures, simulatedLatencies
 *
 * + resetStatistics(), describeStatistics()
 */

export function createStatistics() {
  const _counters = {
    executedScenarios: 0,
    simulatedEvents: 0,
    simulatedActions: 0,
    simulatedFailures: 0,
    simulatedLatencies: 0,
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
        "Connector Simulator — Statistics",
        `  Executed Scenarios: ${s.executedScenarios}`,
        `  Simulated Events: ${s.simulatedEvents}`,
        `  Simulated Actions: ${s.simulatedActions}`,
        `  Simulated Failures: ${s.simulatedFailures}`,
        `  Simulated Latencies: ${s.simulatedLatencies}`,
      ];
      return lines.join("\n");
    },
  });
}