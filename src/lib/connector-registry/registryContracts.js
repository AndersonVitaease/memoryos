/**
 * Connector Registry — Contracts (Sprint 30)
 *
 * Contratos imutáveis para o Connector Registry Engine.
 *
 * NÃO importa: Memory Engine, Cognitive Engine, Intelligence Engine,
 * Autonomous Engine, Enterprise Integration Layer, Universal Event Bus.
 *
 * Define constantes compatíveis com EIL/UEB/CSF localmente para manter
 * isolamento total. Nenhum import de outros módulos da plataforma.
 *
 * Todos os objetos são Object.freeze().
 * Todos os IDs são sequenciais (nenhum UUID, Math.random ou Date.now como ID).
 */

// === Compatible Constants (defined locally for isolation) ===

export const CATEGORIES = [
  "messaging", "email", "storage", "crm", "erp",
  "iot", "payment", "telecom", "other",
];

export const CONNECTOR_TYPES = ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"];

export const LIFECYCLE_STATES = [
  "CREATED", "INITIALIZED", "CONNECTED", "DISCONNECTED", "DESTROYED",
];

export const CAPABILITIES = [
  "READ", "WRITE", "SEARCH", "CREATE", "UPDATE",
  "DELETE", "STREAM", "NOTIFICATION",
];

export const PERMISSION_TYPES = ["ALLOW", "DENY", "INHERIT"];

export const CONNECTOR_STATUSES = [
  "REGISTERED", "ACTIVE", "PAUSED", "DISABLED", "ERROR",
];

export const AUTHENTICATION_TYPES = [
  "NONE", "API_KEY", "TOKEN", "OAUTH", "BASIC", "CUSTOM",
];

export const SDK_VERSION = "1.0.0";

export const SDK_COMPATIBILITY_OPERATORS = [">=", ">", "<=", "<", "="];

// === CRE-Specific Constants ===

export const REGISTRY_STATUSES = [
  "REGISTERED", "ACTIVE", "INACTIVE",
  "CONNECTED", "DISCONNECTED", "ERROR",
];

export const HEALTH_STATUSES = ["HEALTHY", "UNHEALTHY", "UNKNOWN"];

export const FILTER_TYPES = [
  "ACTIVE", "INACTIVE", "CONNECTED", "DISCONNECTED", "HEALTHY", "UNHEALTHY",
];

// === Sequential ID Generation ===

let _registrationIdCounter = 0;
let _connectorIdCounter = 0;

export function nextRegistrationId() {
  _registrationIdCounter++;
  return `cre-reg-${_registrationIdCounter}`;
}

export function nextConnectorId() {
  _connectorIdCounter++;
  return `cre-conn-${_connectorIdCounter}`;
}

export function _resetIdsForTests() {
  _registrationIdCounter = 0;
  _connectorIdCounter = 0;
}

// === Deep Freeze ===

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

// === Connector Record Builder ===

export function buildConnectorRecord(config = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("buildConnectorRecord requires a config object");
  }
  if (!config.connectorName || typeof config.connectorName !== "string") {
    throw new Error("connectorName is required");
  }

  return deepFreeze({
    registrationId: config.registrationId || nextRegistrationId(),
    connectorId: config.connectorId || nextConnectorId(),
    connectorName: config.connectorName,
    connectorVersion: typeof config.connectorVersion === "string" ? config.connectorVersion : "1.0.0",
    vendor: typeof config.vendor === "string" ? config.vendor : "unknown",
    description: typeof config.description === "string" ? config.description : "",
    category: CATEGORIES.includes(config.category) ? config.category : "other",
    connectorType: CONNECTOR_TYPES.includes(config.connectorType) ? config.connectorType : "BIDIRECTIONAL",
    sdkVersion: typeof config.sdkVersion === "string" ? config.sdkVersion : SDK_VERSION,
    sdkCompatibility: typeof config.sdkCompatibility === "string" ? config.sdkCompatibility : `>=${SDK_VERSION}`,
    minimumMemoryOSVersion: typeof config.minimumMemoryOSVersion === "string" ? config.minimumMemoryOSVersion : "1.0.0",
    status: REGISTRY_STATUSES.includes(config.status) ? config.status : "REGISTERED",
    health: HEALTH_STATUSES.includes(config.health) ? config.health : "UNKNOWN",
    supportedEvents: Array.isArray(config.supportedEvents) ? [...config.supportedEvents] : [],
    supportedActions: Array.isArray(config.supportedActions) ? [...config.supportedActions] : [],
    supportedCapabilities: Array.isArray(config.supportedCapabilities)
      ? config.supportedCapabilities.filter((c) => CAPABILITIES.includes(c))
      : [],
    permissions: Array.isArray(config.permissions) ? [...config.permissions] : [],
    tags: Array.isArray(config.tags) ? [...config.tags] : [],
    metadata: config.metadata && typeof config.metadata === "object" ? { ...config.metadata } : {},
    registeredAt: typeof config.registeredAt === "string" ? config.registeredAt : new Date().toISOString(),
  });
}