/**
 * Validators (Sprint 30)
 *
 * Validadores para connectors, manifestos, compatibilidade e capacidades.
 *
 * Todos retornam { valid, errors }.
 * Jamais lançam exceções.
 */

import {
  CATEGORIES,
  CONNECTOR_TYPES,
  CAPABILITIES,
  REGISTRY_STATUSES,
  HEALTH_STATUSES,
  SDK_COMPATIBILITY_OPERATORS,
} from "./registryContracts.js";
import { parseSdkCompatibility, parseVersion } from "./connectorCompatibility.js";

function _result(valid, errors) {
  return { valid, errors: errors || [] };
}

function _isString(v) {
  return typeof v === "string" && v.length > 0;
}

function _isObject(v) {
  return v !== null && typeof v === "object";
}

function _isArray(v) {
  return Array.isArray(v);
}

export function validateConnector(connector) {
  if (!_isObject(connector)) {
    return _result(false, ["connector must be an object"]);
  }

  const errors = [];

  if (!_isString(connector.connectorId)) {
    errors.push("connector.connectorId is required");
  }
  if (!_isString(connector.connectorName)) {
    errors.push("connector.connectorName is required");
  }
  if (!_isString(connector.connectorVersion)) {
    errors.push("connector.connectorVersion is required");
  }
  if (!_isString(connector.vendor)) {
    errors.push("connector.vendor is required");
  }
  if (connector.category && !CATEGORIES.includes(connector.category)) {
    errors.push(`connector.category invalid: ${connector.category}`);
  }
  if (connector.connectorType && !CONNECTOR_TYPES.includes(connector.connectorType)) {
    errors.push(`connector.connectorType invalid: ${connector.connectorType}`);
  }
  if (connector.status && !REGISTRY_STATUSES.includes(connector.status)) {
    errors.push(`connector.status invalid: ${connector.status}`);
  }
  if (connector.health && !HEALTH_STATUSES.includes(connector.health)) {
    errors.push(`connector.health invalid: ${connector.health}`);
  }
  if (!_isArray(connector.supportedEvents)) {
    errors.push("connector.supportedEvents must be an array");
  }
  if (!_isArray(connector.supportedActions)) {
    errors.push("connector.supportedActions must be an array");
  }
  if (!_isArray(connector.supportedCapabilities)) {
    errors.push("connector.supportedCapabilities must be an array");
  } else {
    for (const cap of connector.supportedCapabilities) {
      if (!CAPABILITIES.includes(cap)) {
        errors.push(`connector.supportedCapabilities invalid capability: ${cap}`);
      }
    }
  }

  return _result(errors.length === 0, errors);
}

export function validateManifest(manifest) {
  if (!_isObject(manifest)) {
    return _result(false, ["manifest must be an object"]);
  }

  const errors = [];

  if (!_isString(manifest.connectorName)) {
    errors.push("manifest.connectorName is required");
  }
  if (!_isString(manifest.connectorVersion)) {
    errors.push("manifest.connectorVersion is required");
  }
  if (!_isString(manifest.sdkVersion)) {
    errors.push("manifest.sdkVersion is required");
  }
  if (manifest.category && !CATEGORIES.includes(manifest.category)) {
    errors.push(`manifest.category invalid: ${manifest.category}`);
  }
  if (manifest.connectorType && !CONNECTOR_TYPES.includes(manifest.connectorType)) {
    errors.push(`manifest.connectorType invalid: ${manifest.connectorType}`);
  }
  if (manifest.sdkCompatibility) {
    const spec = parseSdkCompatibility(manifest.sdkCompatibility);
    if (!spec) {
      errors.push(`manifest.sdkCompatibility invalid: ${manifest.sdkCompatibility}`);
    }
  }

  return _result(errors.length === 0, errors);
}

export function validateCompatibility(compatConfig) {
  if (!_isObject(compatConfig)) {
    return _result(false, ["compatibility config must be an object"]);
  }

  const errors = [];

  if (compatConfig.sdkVersion !== undefined) {
    if (!_isString(compatConfig.sdkVersion)) {
      errors.push("compatibility.sdkVersion must be a non-empty string");
    } else if (!parseVersion(compatConfig.sdkVersion)) {
      errors.push(`compatibility.sdkVersion invalid format: ${compatConfig.sdkVersion}`);
    }
  }
  if (compatConfig.memoryOSVersion !== undefined) {
    if (!_isString(compatConfig.memoryOSVersion)) {
      errors.push("compatibility.memoryOSVersion must be a non-empty string");
    } else if (!parseVersion(compatConfig.memoryOSVersion)) {
      errors.push(`compatibility.memoryOSVersion invalid format: ${compatConfig.memoryOSVersion}`);
    }
  }
  if (compatConfig.operator !== undefined && !SDK_COMPATIBILITY_OPERATORS.includes(compatConfig.operator)) {
    errors.push(`compatibility.operator invalid: ${compatConfig.operator}`);
  }

  return _result(errors.length === 0, errors);
}

export function validateCapability(capability) {
  if (typeof capability !== "string" || capability.length === 0) {
    return _result(false, ["capability must be a non-empty string"]);
  }
  if (!CAPABILITIES.includes(capability)) {
    return _result(false, [`capability invalid: ${capability}`]);
  }
  return _result(true, []);
}

export function createValidators() {
  return Object.freeze({
    validateConnector,
    validateManifest,
    validateCompatibility,
    validateCapability,
  });
}