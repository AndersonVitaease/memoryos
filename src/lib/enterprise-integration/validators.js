/**
 * Validators (Sprint 27)
 *
 * Todos retornam { valid, errors }.
 * Jamais lançam exceções.
 */

import {
  CONNECTOR_FIELDS,
  CONNECTOR_STATUSES,
  AUTHENTICATION_TYPES,
  CAPABILITIES,
  PERMISSION_TYPES,
  PERMISSION_SCOPES,
  EVENT_FIELDS,
  ACTION_FIELDS,
  EVENT_TYPES,
  ACTION_TYPES,
} from "./contracts.js";
import { validateCapabilitySet } from "./connectorCapabilities.js";

function _isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function validateConnector(connector) {
  const errors = [];

  if (!_isPlainObject(connector)) {
    return { valid: false, errors: ["connector is not an object"] };
  }

  for (const field of CONNECTOR_FIELDS) {
    if (!(field in connector)) {
      errors.push(`missing field: ${field}`);
    }
  }

  if (connector.connectorId && typeof connector.connectorId !== "string") {
    errors.push("connectorId must be a string");
  }

  if (!connector.connectorName || typeof connector.connectorName !== "string") {
    errors.push("connectorName must be a non-empty string");
  }

  if (
    connector.status &&
    !CONNECTOR_STATUSES.includes(connector.status)
  ) {
    errors.push(`invalid status: ${connector.status}`);
  }

  if (
    connector.authenticationType &&
    !AUTHENTICATION_TYPES.includes(connector.authenticationType)
  ) {
    errors.push(`invalid authenticationType: ${connector.authenticationType}`);
  }

  if (connector.supportedEvents && !Array.isArray(connector.supportedEvents)) {
    errors.push("supportedEvents must be an array");
  }

  if (connector.supportedActions && !Array.isArray(connector.supportedActions)) {
    errors.push("supportedActions must be an array");
  }

  if (connector.supportedCapabilities) {
    const capResult = validateCapabilitySet(connector.supportedCapabilities);
    if (!capResult.valid) {
      errors.push(...capResult.errors);
    }
  }

  if (connector.permissions && !Array.isArray(connector.permissions)) {
    errors.push("permissions must be an array");
  }

  if (connector.metadata && !_isPlainObject(connector.metadata)) {
    errors.push("metadata must be an object");
  }

  if (!Object.isFrozen(connector)) {
    errors.push("connector must be frozen");
  }

  return { valid: errors.length === 0, errors };
}

export function validateEvent(event) {
  const errors = [];

  if (!_isPlainObject(event)) {
    return { valid: false, errors: ["event is not an object"] };
  }

  for (const field of EVENT_FIELDS) {
    if (!(field in event)) {
      errors.push(`missing field: ${field}`);
    }
  }

  if (event.eventId && typeof event.eventId !== "string") {
    errors.push("eventId must be a string");
  }

  if (!event.eventType || typeof event.eventType !== "string") {
    errors.push("eventType must be a non-empty string");
  }

  if (event.eventVersion && typeof event.eventVersion !== "string") {
    errors.push("eventVersion must be a string");
  }

  if (event.timestamp && typeof event.timestamp !== "string") {
    errors.push("timestamp must be a string");
  }

  if (event.payload && !_isPlainObject(event.payload)) {
    errors.push("payload must be an object");
  }

  if (event.metadata && !_isPlainObject(event.metadata)) {
    errors.push("metadata must be an object");
  }

  if (!Object.isFrozen(event)) {
    errors.push("event must be frozen");
  }

  return { valid: errors.length === 0, errors };
}

export function validateAction(action) {
  const errors = [];

  if (!_isPlainObject(action)) {
    return { valid: false, errors: ["action is not an object"] };
  }

  for (const field of ACTION_FIELDS) {
    if (!(field in action)) {
      errors.push(`missing field: ${field}`);
    }
  }

  if (action.actionId && typeof action.actionId !== "string") {
    errors.push("actionId must be a string");
  }

  if (!action.actionType || typeof action.actionType !== "string") {
    errors.push("actionType must be a non-empty string");
  }

  if (action.actionVersion && typeof action.actionVersion !== "string") {
    errors.push("actionVersion must be a string");
  }

  if (action.payload && !_isPlainObject(action.payload)) {
    errors.push("payload must be an object");
  }

  if (!Object.isFrozen(action)) {
    errors.push("action must be frozen");
  }

  return { valid: errors.length === 0, errors };
}

export function validatePermissions(permissions) {
  const errors = [];

  if (!Array.isArray(permissions)) {
    return { valid: false, errors: ["permissions must be an array"] };
  }

  permissions.forEach((perm, idx) => {
    if (!_isPlainObject(perm)) {
      errors.push(`permission[${idx}] is not an object`);
      return;
    }

    if (!perm.permissionId || typeof perm.permissionId !== "string") {
      errors.push(`permission[${idx}] missing permissionId`);
    }

    if (!PERMISSION_SCOPES.includes(perm.scope)) {
      errors.push(`permission[${idx}] invalid scope: ${perm.scope}`);
    }

    if (!PERMISSION_TYPES.includes(perm.type)) {
      errors.push(`permission[${idx}] invalid type: ${perm.type}`);
    }

    if (!Object.isFrozen(perm)) {
      errors.push(`permission[${idx}] must be frozen`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function validateAuthentication(auth) {
  const errors = [];

  if (!_isPlainObject(auth)) {
    return { valid: false, errors: ["authentication config is not an object"] };
  }

  if (!auth.authType) {
    errors.push("authType is required");
  } else if (!AUTHENTICATION_TYPES.includes(auth.authType)) {
    errors.push(`invalid authType: ${auth.authType}`);
  }

  if (auth.authType && auth.authType !== "NONE") {
    if (!auth.connectorId) {
      errors.push("connectorId is required for non-NONE authentication");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCapabilities(capabilities) {
  const result = validateCapabilitySet(capabilities);
  return { valid: result.valid, errors: result.errors };
}

export function validateEventType(eventType) {
  if (!eventType || typeof eventType !== "string") {
    return { valid: false, errors: ["eventType must be a non-empty string"] };
  }
  if (!EVENT_TYPES.includes(eventType)) {
    return { valid: false, errors: [`invalid eventType: ${eventType}`] };
  }
  return { valid: true, errors: [] };
}

export function validateActionType(actionType) {
  if (!actionType || typeof actionType !== "string") {
    return { valid: false, errors: ["actionType must be a non-empty string"] };
  }
  if (!ACTION_TYPES.includes(actionType)) {
    return { valid: false, errors: [`invalid actionType: ${actionType}`] };
  }
  return { valid: true, errors: [] };
}

export {
  CONNECTOR_STATUSES,
  AUTHENTICATION_TYPES,
  CAPABILITIES,
  PERMISSION_TYPES,
  PERMISSION_SCOPES,
  EVENT_TYPES,
  ACTION_TYPES,
};