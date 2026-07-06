/**
 * Connector Validators (Sprint 29)
 *
 *   validateManifest(manifest)
 *   validateConnector(connector)
 *   validateVersion(version)
 *   validateLifecycle(state)
 *
 * Todos retornam { valid, errors }.
 * Jamais lançam exceções.
 */

import { parseVersion, parseSdkCompatibility } from "./connectorVersioning.js";
import { LIFECYCLE_STATES, CONNECTOR_TYPES, SDK_VERSION } from "./connectorManifest.js";

function _result(valid, errors) {
  return { valid, errors: errors || [] };
}

export function validateManifest(manifest) {
  try {
    if (!manifest || typeof manifest !== "object") {
      return _result(false, ["manifest is not an object"]);
    }
    if (!Object.isFrozen(manifest)) {
      return _result(false, ["manifest is not frozen"]);
    }
    const errors = [];
    if (!manifest.connectorId) errors.push("connectorId is required");
    if (!manifest.connectorVersion) errors.push("connectorVersion is required");
    if (!manifest.sdkVersion) errors.push("sdkVersion is required");
    if (!manifest.connectorName) errors.push("connectorName is required");
    if (!manifest.vendor) errors.push("vendor is required");
    if (!manifest.category) errors.push("category is required");
    if (!manifest.connectorType) {
      errors.push("connectorType is required");
    } else if (!CONNECTOR_TYPES.includes(manifest.connectorType)) {
      errors.push(`connectorType must be one of: ${CONNECTOR_TYPES.join(", ")}`);
    }
    if (!manifest.sdkCompatibility) {
      errors.push("sdkCompatibility is required");
    } else if (!parseSdkCompatibility(manifest.sdkCompatibility)) {
      errors.push("sdkCompatibility is not a valid operator+version (e.g. >=1.0.0)");
    }
    if (!Array.isArray(manifest.tags)) errors.push("tags must be an array");
    if (!Array.isArray(manifest.permissions)) errors.push("permissions must be an array");
    if (!Array.isArray(manifest.supportedEvents)) errors.push("supportedEvents must be an array");
    if (!Array.isArray(manifest.supportedActions)) errors.push("supportedActions must be an array");
    if (!Array.isArray(manifest.supportedCapabilities)) {
      errors.push("supportedCapabilities must be an array");
    }
    if (!manifest.minimumMemoryOSVersion) {
      errors.push("minimumMemoryOSVersion is required");
    }
    if (manifest.connectorVersion && !parseVersion(manifest.connectorVersion)) {
      errors.push("connectorVersion is not a valid semver");
    }
    if (manifest.minimumMemoryOSVersion && !parseVersion(manifest.minimumMemoryOSVersion)) {
      errors.push("minimumMemoryOSVersion is not a valid semver");
    }
    return _result(errors.length === 0, errors);
  } catch (err) {
    return _result(false, [err.message || "validation error"]);
  }
}

export function validateConnector(connector) {
  try {
    if (!connector || typeof connector !== "object") {
      return _result(false, ["connector is not an object"]);
    }
    const errors = [];

    const manifest =
      typeof connector.manifest === "function" ? connector.manifest : connector.manifest;
    if (!manifest) {
      errors.push("connector must have a manifest");
      return _result(false, errors);
    }
    const mResult = validateManifest(manifest);
    if (!mResult.valid) errors.push(...mResult.errors);

    if (typeof connector.initialize !== "function") {
      errors.push("connector must implement initialize()");
    }
    if (typeof connector.connect !== "function") {
      errors.push("connector must implement connect()");
    }
    if (typeof connector.disconnect !== "function") {
      errors.push("connector must implement disconnect()");
    }
    if (typeof connector.destroy !== "function") {
      errors.push("connector must implement destroy()");
    }

    return _result(errors.length === 0, errors);
  } catch (err) {
    return _result(false, [err.message || "validation error"]);
  }
}

export function validateVersion(version) {
  try {
    if (typeof version !== "string") {
      return _result(false, ["version must be a string"]);
    }
    const parsed = parseVersion(version);
    if (!parsed) {
      return _result(false, ["version is not a valid semver (major.minor.patch)"]);
    }
    return _result(true, []);
  } catch (err) {
    return _result(false, [err.message || "validation error"]);
  }
}

export function validateLifecycle(state) {
  try {
    if (typeof state !== "string") {
      return _result(false, ["lifecycle state must be a string"]);
    }
    if (!LIFECYCLE_STATES.includes(state)) {
      return _result(false, [`invalid lifecycle state: ${state}`]);
    }
    return _result(true, []);
  } catch (err) {
    return _result(false, [err.message || "validation error"]);
  }
}

export function createValidators() {
  return Object.freeze({
    validateManifest,
    validateConnector,
    validateVersion,
    validateLifecycle,
  });
}