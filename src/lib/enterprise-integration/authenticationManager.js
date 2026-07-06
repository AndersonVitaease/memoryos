/**
 * Authentication Manager (Sprint 27)
 *
 * Gerenciamento de configurações de autenticação.
 * Apenas representação — sem autenticação real, sem HTTP.
 */

import { AUTHENTICATION_TYPES } from "./contracts.js";

let _configIdCounter = 0;

export function createAuthenticationManager() {
  const _configs = new Map();

  function validateType(type) {
    return AUTHENTICATION_TYPES.includes(type);
  }

  function createAuthConfig(connectorId, authType, credentials = {}) {
    if (!connectorId || typeof connectorId !== "string") {
      throw new Error("connectorId is required");
    }
    if (!validateType(authType)) {
      throw new Error(`invalid authentication type: ${authType}`);
    }

    _configIdCounter++;
    const config = Object.freeze({
      configId: `eil-auth-${_configIdCounter}`,
      connectorId,
      authType,
      credentials: Object.freeze({ ...credentials }),
      createdAt: new Date().toISOString(),
    });

    _configs.set(connectorId, config);
    return config;
  }

  function getAuthConfig(connectorId) {
    if (!connectorId) return null;
    return _configs.get(connectorId) || null;
  }

  function hasAuth(connectorId) {
    if (!connectorId) return false;
    return _configs.has(connectorId);
  }

  function listConfigs() {
    return [..._configs.values()];
  }

  function removeAuthConfig(connectorId) {
    return _configs.delete(connectorId);
  }

  function count() {
    return _configs.size;
  }

  function reset() {
    _configs.clear();
    _configIdCounter = 0;
  }

  return Object.freeze({
    validateType,
    createAuthConfig,
    getAuthConfig,
    hasAuth,
    listConfigs,
    removeAuthConfig,
    count,
    reset,
  });
}

export { AUTHENTICATION_TYPES };