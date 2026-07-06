/**
 * Connector Loader (Sprint 29)
 *
 * Gerencia carregamento de Connectors.
 *
 * Não executa código externo. Apenas gerenciamento de estado.
 *
 * API:
 *   load(connector)      — carrega um connector descoberto
 *   unload(connectorId) — descarrega um connector
 *   reload(connector)   — recarrega um connector
 */

export function createConnectorLoader(discovery, statistics) {
  const _loaded = new Map();

  function _inc(key) {
    if (statistics && typeof statistics.inc === "function") statistics.inc(key);
  }

  return Object.freeze({
    load(connector) {
      const manifest = connector ? connector.manifest : null;
      if (!manifest || !manifest.connectorId) {
        _inc("connectorErrors");
        return { ok: false, error: "invalid_connector" };
      }
      if (!discovery.exists(manifest.connectorId)) {
        _inc("connectorErrors");
        return { ok: false, error: "not_discovered" };
      }
      if (_loaded.has(manifest.connectorId)) {
        _inc("connectorErrors");
        return { ok: false, error: "already_loaded" };
      }
      _loaded.set(manifest.connectorId, connector);
      _inc("loadedConnectors");
      return { ok: true, connector };
    },

    unload(connectorId) {
      if (!_loaded.has(connectorId)) {
        _inc("connectorErrors");
        return { ok: false, error: "not_loaded" };
      }
      _loaded.delete(connectorId);
      _inc("unloadedConnectors");
      return { ok: true };
    },

    reload(connector) {
      const manifest = connector ? connector.manifest : null;
      if (!manifest || !manifest.connectorId) {
        _inc("connectorErrors");
        return { ok: false, error: "invalid_connector" };
      }
      if (_loaded.has(manifest.connectorId)) {
        _loaded.delete(manifest.connectorId);
      }
      return this.load(connector);
    },

    get(connectorId) {
      return _loaded.get(connectorId) || null;
    },

    isLoaded(connectorId) {
      return _loaded.has(connectorId);
    },

    loadedCount() {
      return _loaded.size;
    },

    loadedIds() {
      return Array.from(_loaded.keys());
    },

    reset() {
      _loaded.clear();
    },
  });
}