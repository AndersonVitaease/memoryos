/**
 * Connector Manifest (Sprint 29)
 *
 * Contrato oficial de Manifesto de Connector.
 * Todo Connector deverá possuir obrigatoriamente um Manifesto.
 *
 * Objeto congelado e imutável.
 */

// === Constants ===

export const LIFECYCLE_STATES = [
  "CREATED",
  "INITIALIZED",
  "CONNECTED",
  "DISCONNECTED",
  "DESTROYED",
];

export const CATEGORIES = [
  "messaging",
  "email",
  "storage",
  "crm",
  "erp",
  "iot",
  "payment",
  "telecom",
  "other",
];

export const SDK_VERSION = "1.0.0";

export const HOOK_NAMES = [
  "beforeConnect",
  "afterConnect",
  "beforeDisconnect",
  "afterDisconnect",
  "beforeDestroy",
  "afterDestroy",
];

// === Sequential ID Generation (Deterministic) ===

let _connectorIdCounter = 0;
let _manifestIdCounter = 0;

export function _resetIdsForTests() {
  _connectorIdCounter = 0;
  _manifestIdCounter = 0;
}

export function nextConnectorId() {
  _connectorIdCounter++;
  return `conn-${_connectorIdCounter}`;
}

export function nextManifestId() {
  _manifestIdCounter++;
  return `man-${_manifestIdCounter}`;
}

// === Deep Freeze ===

function _deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    _deepFreeze(obj[key]);
  }
  return obj;
}

// === Manifest Builder ===

export function buildManifest(data) {
  if (!data || typeof data !== "object") {
    throw new Error("buildManifest requires a data object");
  }

  const manifest = {
    manifestId: data.manifestId || nextManifestId(),
    connectorId: data.connectorId || nextConnectorId(),
    connectorVersion: data.connectorVersion || "1.0.0",
    sdkVersion: data.sdkVersion || SDK_VERSION,
    connectorName: data.connectorName,
    vendor: data.vendor || "unknown",
    description: data.description || "",
    category: data.category || "other",
    tags: Array.isArray(data.tags) ? [...data.tags] : [],
    permissions: Array.isArray(data.permissions) ? [...data.permissions] : [],
    supportedEvents: Array.isArray(data.supportedEvents) ? [...data.supportedEvents] : [],
    supportedActions: Array.isArray(data.supportedActions) ? [...data.supportedActions] : [],
    supportedCapabilities: Array.isArray(data.supportedCapabilities)
      ? [...data.supportedCapabilities]
      : [],
    minimumMemoryOSVersion: data.minimumMemoryOSVersion || "1.0.0",
    metadata: data.metadata && typeof data.metadata === "object" ? { ...data.metadata } : {},
  };

  return _deepFreeze(manifest);
}