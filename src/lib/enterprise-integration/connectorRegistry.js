/**
 * Connector Registry (Sprint 27)
 *
 * Registro determinístico de Connectors.
 * Operações O(1) via Map.
 */

export function createConnectorRegistry() {
  const _byId = new Map();

  function register(connector) {
    if (!connector || typeof connector !== "object") {
      throw new Error("connector is required");
    }
    if (!connector.connectorId || typeof connector.connectorId !== "string") {
      throw new Error("connector must have a connectorId");
    }
    _byId.set(connector.connectorId, connector);
    return connector;
  }

  function unregister(connectorId) {
    if (!connectorId) return false;
    return _byId.delete(connectorId);
  }

  function exists(connectorId) {
    if (!connectorId) return false;
    return _byId.has(connectorId);
  }

  function get(connectorId) {
    if (!connectorId) return null;
    return _byId.get(connectorId) || null;
  }

  function list(status) {
    const all = [..._byId.values()];
    if (!status) return all;
    return all.filter((c) => c.status === status);
  }

  function count() {
    return _byId.size;
  }

  function reset() {
    _byId.clear();
  }

  return Object.freeze({
    register,
    unregister,
    exists,
    get,
    list,
    count,
    reset,
  });
}