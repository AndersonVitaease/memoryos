/**
 * Integration Engine (Sprint 27)
 *
 * Fachada principal da Enterprise Integration Layer.
 * Combina todos os componentes e fornece uma API unificada.
 *
 * NÃO conhece Engines, Especialistas, domínio de negócio, memória ou IA.
 */

import { createStatistics } from "./statistics.js";
import { createConnectorRegistry } from "./connectorRegistry.js";
import { createPermissionManager } from "./permissionManager.js";
import { createAuthenticationManager } from "./authenticationManager.js";
import { createEventDispatcher } from "./eventDispatcher.js";
import { createActionDispatcher } from "./actionDispatcher.js";
import { createConnector, updateConnector } from "./connectorBuilder.js";

export function createIntegrationEngine() {
  const statistics = createStatistics();
  const registry = createConnectorRegistry();
  const permissionManager = createPermissionManager();
  const authManager = createAuthenticationManager();
  const eventDispatcher = createEventDispatcher(registry, statistics);
  const actionDispatcher = createActionDispatcher(
    registry,
    permissionManager,
    statistics
  );

  function registerConnector(connectorData = {}) {
    const connector = createConnector(connectorData);
    registry.register(connector);
    statistics.inc("registeredConnectors");
    if (connector.status === "ACTIVE") statistics.inc("activeConnectors");
    if (connector.status === "DISABLED") statistics.inc("disabledConnectors");
    return connector;
  }

  function unregisterConnector(connectorId) {
    const connector = registry.get(connectorId);
    if (!connector) return false;

    if (connector.status === "ACTIVE") statistics.dec("activeConnectors");
    if (connector.status === "DISABLED") statistics.dec("disabledConnectors");
    statistics.dec("registeredConnectors");

    return registry.unregister(connectorId);
  }

  function setConnectorStatus(connectorId, status) {
    const existing = registry.get(connectorId);
    if (!existing) return null;

    if (existing.status === "ACTIVE") statistics.dec("activeConnectors");
    if (existing.status === "DISABLED") statistics.dec("disabledConnectors");

    const updated = updateConnector(existing, { status });
    registry.register(updated);

    if (status === "ACTIVE") statistics.inc("activeConnectors");
    if (status === "DISABLED") statistics.inc("disabledConnectors");

    return updated;
  }

  function receiveEvent(eventData = {}) {
    return eventDispatcher.receiveEvent(eventData);
  }

  function requestAction(actionData = {}) {
    return actionDispatcher.requestAction(actionData);
  }

  function getStats() {
    return statistics.snapshot();
  }

  function reset() {
    statistics.resetStatistics();
    registry.reset();
    permissionManager.reset();
    authManager.reset();
    eventDispatcher.reset();
    actionDispatcher.reset();
  }

  function describe() {
    const stats = statistics.snapshot();
    return [
      "Enterprise Integration Layer",
      `  Registered Connectors: ${stats.registeredConnectors}`,
      `  Active Connectors: ${stats.activeConnectors}`,
      `  Disabled Connectors: ${stats.disabledConnectors}`,
      `  Dispatched Events: ${stats.dispatchedEvents}`,
      `  Dispatched Actions: ${stats.dispatchedActions}`,
      `  Permission Checks: ${stats.permissionChecks}`,
      `  Failed Events: ${stats.failedEvents}`,
      `  Failed Actions: ${stats.failedActions}`,
      `  Permissions: ${permissionManager.count()}`,
      `  Auth Configs: ${authManager.count()}`,
    ].join("\n");
  }

  return Object.freeze({
    registry,
    permissionManager,
    authManager,
    eventDispatcher,
    actionDispatcher,
    statistics,
    registerConnector,
    unregisterConnector,
    setConnectorStatus,
    receiveEvent,
    requestAction,
    getStats,
    reset,
    describe,
  });
}