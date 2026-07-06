/**
 * Connector Discovery (Sprint 29)
 *
 * Registro de descoberta de Connectors.
 *
 * Sem acesso ao sistema operacional. Apenas contratos.
 *
 * API:
 *   discover(manifest)  — registra um manifesto
 *   scan()              — retorna todos os manifestos registrados
 *   exists(connectorId) — verifica se um connector foi descoberto
 *   list()              — retorna IDs de todos os connectors descobertos
 */

export function createDiscoveryRegistry() {
  const _manifests = new Map();

  return Object.freeze({
    discover(manifest) {
      if (!manifest || !manifest.connectorId) return false;
      if (_manifests.has(manifest.connectorId)) return false;
      _manifests.set(manifest.connectorId, manifest);
      return true;
    },

    scan() {
      return Array.from(_manifests.values());
    },

    exists(connectorId) {
      return _manifests.has(connectorId);
    },

    list() {
      return Array.from(_manifests.keys());
    },

    get(connectorId) {
      return _manifests.get(connectorId) || null;
    },

    remove(connectorId) {
      return _manifests.delete(connectorId);
    },

    size() {
      return _manifests.size;
    },

    reset() {
      _manifests.clear();
    },
  });
}