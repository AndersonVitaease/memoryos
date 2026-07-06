/**
 * Connector Builder (Sprint 27)
 *
 * Operações de alto nível para criar e manipular Connectors.
 * Todos os resultados são Object.freeze().
 */

import { buildConnector, CONNECTOR_STATUSES } from "./contracts.js";

export function createConnector(connectorData = {}) {
  return buildConnector(connectorData);
}

export function cloneConnector(connector, overrides = {}) {
  if (!connector || typeof connector !== "object") {
    throw new Error("connector is required");
  }

  return buildConnector({
    connectorId:
      overrides.connectorId !== undefined ? overrides.connectorId : connector.connectorId,
    connectorVersion:
      overrides.connectorVersion !== undefined
        ? overrides.connectorVersion
        : connector.connectorVersion,
    connectorName:
      overrides.connectorName !== undefined
        ? overrides.connectorName
        : connector.connectorName,
    vendor: overrides.vendor !== undefined ? overrides.vendor : connector.vendor,
    description:
      overrides.description !== undefined ? overrides.description : connector.description,
    authenticationType:
      overrides.authenticationType !== undefined
        ? overrides.authenticationType
        : connector.authenticationType,
    supportedEvents:
      overrides.supportedEvents !== undefined
        ? overrides.supportedEvents
        : connector.supportedEvents,
    supportedActions:
      overrides.supportedActions !== undefined
        ? overrides.supportedActions
        : connector.supportedActions,
    supportedCapabilities:
      overrides.supportedCapabilities !== undefined
        ? overrides.supportedCapabilities
        : connector.supportedCapabilities,
    permissions:
      overrides.permissions !== undefined ? overrides.permissions : connector.permissions,
    status: overrides.status !== undefined ? overrides.status : connector.status,
    metadata: overrides.metadata !== undefined ? overrides.metadata : connector.metadata,
  });
}

export function updateConnector(connector, updates = {}) {
  if (!connector || typeof connector !== "object") {
    throw new Error("connector is required");
  }
  return cloneConnector(connector, updates);
}

export function freezeConnector(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("connector object is required");
  }
  if (Object.isFrozen(obj)) return obj;
  return buildConnector(obj);
}

export function setStatus(connector, status) {
  if (!connector || typeof connector !== "object") {
    throw new Error("connector is required");
  }
  if (!CONNECTOR_STATUSES.includes(status)) {
    throw new Error(`invalid status: ${status}`);
  }
  return cloneConnector(connector, { status });
}

export { CONNECTOR_STATUSES };