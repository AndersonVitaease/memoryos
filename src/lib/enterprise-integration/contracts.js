/**
 * Enterprise Integration Layer — Contracts (Sprint 27)
 *
 * Contratos imutáveis para padronização de integrações externas.
 *
 * NÃO conhece: Engines, Especialistas, domínio de negócio, memória, IA.
 * Conhece apenas: Connectors, Contratos, Eventos, Ações, Permissões.
 *
 * Todos os objetos são Object.freeze().
 * Todos os IDs são sequenciais (nenhum UUID, Math.random ou Date.now como ID).
 */

// === Connector Fields ===

export const CONNECTOR_FIELDS = [
  "connectorId",
  "connectorVersion",
  "connectorName",
  "vendor",
  "description",
  "authenticationType",
  "supportedEvents",
  "supportedActions",
  "supportedCapabilities",
  "permissions",
  "status",
  "metadata",
];

// === Connector Status ===

export const CONNECTOR_STATUSES = [
  "REGISTERED",
  "ACTIVE",
  "PAUSED",
  "DISABLED",
  "ERROR",
];

// === Authentication Types ===

export const AUTHENTICATION_TYPES = [
  "NONE",
  "API_KEY",
  "TOKEN",
  "OAUTH",
  "BASIC",
  "CUSTOM",
];

// === Capabilities ===

export const CAPABILITIES = [
  "READ",
  "WRITE",
  "SEARCH",
  "CREATE",
  "UPDATE",
  "DELETE",
  "STREAM",
  "NOTIFICATION",
];

// === Permission Types ===

export const PERMISSION_TYPES = ["ALLOW", "DENY", "INHERIT"];

// === Permission Scopes ===

export const PERMISSION_SCOPES = [
  "company",
  "tenant",
  "department",
  "role",
  "user",
  "system",
  "connector",
];

// === Event Fields ===

export const EVENT_FIELDS = [
  "eventId",
  "eventVersion",
  "eventType",
  "timestamp",
  "companyId",
  "tenantId",
  "connectorId",
  "sessionId",
  "userId",
  "payload",
  "metadata",
];

// === Action Fields ===

export const ACTION_FIELDS = [
  "actionId",
  "actionVersion",
  "actionType",
  "timestamp",
  "companyId",
  "tenantId",
  "connectorId",
  "sessionId",
  "userId",
  "payload",
  "metadata",
];

// === Event Types ===

export const EVENT_TYPES = [
  "CALL_RECEIVED",
  "EMAIL_RECEIVED",
  "CAMERA_ALERT",
  "ORDER_CREATED",
  "ORDER_CANCELLED",
  "LOGIN",
  "LOGOUT",
  "DOCUMENT_CREATED",
  "PAYMENT_APPROVED",
  "PACKAGE_DELAYED",
  "MEETING_FINISHED",
  "VOICE_COMMAND",
];

// === Action Types ===

export const ACTION_TYPES = [
  "OPEN_CAMERA",
  "SEARCH_CUSTOMER",
  "SEARCH_BOOKING",
  "CREATE_TICKET",
  "BOOK_FLIGHT",
  "TRACK_PACKAGE",
  "SEND_EMAIL",
  "CREATE_REMINDER",
];

// === Deterministic ID Generation ===

let _connectorIdCounter = 0;
let _eventIdCounter = 0;
let _actionIdCounter = 0;
let _permissionIdCounter = 0;

function generateConnectorId() {
  _connectorIdCounter++;
  return `eil-conn-${_connectorIdCounter}`;
}

function generateEventId() {
  _eventIdCounter++;
  return `eil-evt-${_eventIdCounter}`;
}

function generateActionId() {
  _actionIdCounter++;
  return `eil-act-${_actionIdCounter}`;
}

function generatePermissionId() {
  _permissionIdCounter++;
  return `eil-perm-${_permissionIdCounter}`;
}

export function _resetIdsForTests() {
  _connectorIdCounter = 0;
  _eventIdCounter = 0;
  _actionIdCounter = 0;
  _permissionIdCounter = 0;
}

// === Deep Freeze Helper ===

function _deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "object" && obj[key] !== null && !Object.isFrozen(obj[key])) {
      _deepFreeze(obj[key]);
    }
  });
  return Object.freeze(obj);
}

// === Builders ===

export function buildConnector({
  connectorId,
  connectorVersion,
  connectorName,
  vendor,
  description,
  authenticationType,
  supportedEvents,
  supportedActions,
  supportedCapabilities,
  permissions,
  status,
  metadata,
} = {}) {
  if (!connectorName || typeof connectorName !== "string") {
    throw new Error("connectorName is required");
  }

  const authType = AUTHENTICATION_TYPES.includes(authenticationType)
    ? authenticationType
    : "NONE";
  const stat = CONNECTOR_STATUSES.includes(status) ? status : "REGISTERED";

  return Object.freeze({
    connectorId: connectorId || generateConnectorId(),
    connectorVersion: typeof connectorVersion === "string" ? connectorVersion : "1.0.0",
    connectorName,
    vendor: typeof vendor === "string" ? vendor : "unknown",
    description: typeof description === "string" ? description : "",
    authenticationType: authType,
    supportedEvents: Array.isArray(supportedEvents)
      ? Object.freeze([...supportedEvents])
      : Object.freeze([]),
    supportedActions: Array.isArray(supportedActions)
      ? Object.freeze([...supportedActions])
      : Object.freeze([]),
    supportedCapabilities: Array.isArray(supportedCapabilities)
      ? Object.freeze([...supportedCapabilities])
      : Object.freeze([]),
    permissions: Array.isArray(permissions)
      ? Object.freeze([...permissions])
      : Object.freeze([]),
    status: stat,
    metadata:
      metadata && typeof metadata === "object"
        ? Object.freeze({ ...metadata })
        : Object.freeze({}),
  });
}

export function buildEvent({
  eventId,
  eventVersion,
  eventType,
  timestamp,
  companyId,
  tenantId,
  connectorId,
  sessionId,
  userId,
  payload,
  metadata,
} = {}) {
  if (!eventType || typeof eventType !== "string") {
    throw new Error("eventType is required");
  }

  return Object.freeze({
    eventId: eventId || generateEventId(),
    eventVersion: typeof eventVersion === "string" ? eventVersion : "1.0.0",
    eventType,
    timestamp: typeof timestamp === "string" ? timestamp : new Date().toISOString(),
    companyId: typeof companyId === "string" ? companyId : "",
    tenantId: typeof tenantId === "string" ? tenantId : "",
    connectorId: typeof connectorId === "string" ? connectorId : "",
    sessionId: typeof sessionId === "string" ? sessionId : "",
    userId: typeof userId === "string" ? userId : "",
    payload:
      payload && typeof payload === "object"
        ? Object.freeze({ ...payload })
        : Object.freeze({}),
    metadata:
      metadata && typeof metadata === "object"
        ? Object.freeze({ ...metadata })
        : Object.freeze({}),
  });
}

export function buildAction({
  actionId,
  actionVersion,
  actionType,
  timestamp,
  companyId,
  tenantId,
  connectorId,
  sessionId,
  userId,
  payload,
  metadata,
} = {}) {
  if (!actionType || typeof actionType !== "string") {
    throw new Error("actionType is required");
  }

  return Object.freeze({
    actionId: actionId || generateActionId(),
    actionVersion: typeof actionVersion === "string" ? actionVersion : "1.0.0",
    actionType,
    timestamp: typeof timestamp === "string" ? timestamp : new Date().toISOString(),
    companyId: typeof companyId === "string" ? companyId : "",
    tenantId: typeof tenantId === "string" ? tenantId : "",
    connectorId: typeof connectorId === "string" ? connectorId : "",
    sessionId: typeof sessionId === "string" ? sessionId : "",
    userId: typeof userId === "string" ? userId : "",
    payload:
      payload && typeof payload === "object"
        ? Object.freeze({ ...payload })
        : Object.freeze({}),
    metadata:
      metadata && typeof metadata === "object"
        ? Object.freeze({ ...metadata })
        : Object.freeze({}),
  });
}

export function buildPermission({
  permissionId,
  scope,
  scopeId,
  connectorId,
  type,
  metadata,
} = {}) {
  if (!PERMISSION_SCOPES.includes(scope)) {
    throw new Error(`invalid permission scope: ${scope}`);
  }
  if (!PERMISSION_TYPES.includes(type)) {
    throw new Error(`invalid permission type: ${type}`);
  }

  return Object.freeze({
    permissionId: permissionId || generatePermissionId(),
    scope,
    scopeId: typeof scopeId === "string" ? scopeId : "",
    connectorId: typeof connectorId === "string" ? connectorId : "",
    type,
    metadata:
      metadata && typeof metadata === "object"
        ? Object.freeze({ ...metadata })
        : Object.freeze({}),
  });
}

// === Scope Specificity (for conflict resolution) ===
// Lower number = more specific

export const SCOPE_SPECIFICITY = {
  user: 1,
  role: 2,
  department: 3,
  tenant: 4,
  company: 5,
  system: 6,
  connector: 7,
};