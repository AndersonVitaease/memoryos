/**
 * Scenario Registry (Sprint 30)
 *
 * Armazena cenários de simulação por ID.
 *
 * register()   — armazena cenário
 * unregister() — remove por ID
 * exists()     — verifica existência
 * list()       — retorna todos
 * reset()      — limpa registry
 */

export function createScenarioRegistry() {
  const _scenarios = new Map();

  return Object.freeze({
    register(scenario) {
      if (!scenario || !scenario.scenarioId) {
        return { success: false, error: "scenario or scenarioId missing" };
      }
      _scenarios.set(scenario.scenarioId, scenario);
      return { success: true, scenarioId: scenario.scenarioId };
    },

    unregister(scenarioId) {
      if (!scenarioId) {
        return { success: false, error: "scenarioId missing" };
      }
      const existed = _scenarios.has(scenarioId);
      _scenarios.delete(scenarioId);
      return { success: existed, scenarioId };
    },

    exists(scenarioId) {
      return _scenarios.has(scenarioId);
    },

    get(scenarioId) {
      return _scenarios.get(scenarioId) || null;
    },

    list() {
      return Object.freeze([..._scenarios.values()]);
    },

    count() {
      return _scenarios.size;
    },

    reset() {
      _scenarios.clear();
      return { success: true, cleared: true };
    },
  });
}