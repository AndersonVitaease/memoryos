/**
 * Universal Event Bus — Contracts (Sprint 28)
 *
 * Contratos imutáveis para o barramento de eventos universal.
 *
 * NÃO conhece Engines, Connectors ou domínio da aplicação.
 * Conhece apenas: Eventos, Contratos, Assinaturas.
 *
 * Todos os objetos são Object.freeze().
 * IDs são determinísticos (sequenciais — nenhum Math.random/UUID).
 */

// === Event ===

export const EVENT_FIELDS = [
  "eventId",
  "eventType",
  "priority",
  "timestamp",
  "companyId",
  "tenantId",
  "userId",
  "sessionId",
  "correlationId",
  "connectorId",
  "source",
  "target",
  "payload",
  "metadata",
];

export const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW", "BACKGROUND"];

export const PRIORITY_RANK = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  BACKGROUND: 4,
};

// Weights for anti-starvation weighted round-robin scheduling.
// Higher priority gets more slots per cycle; low priorities still get served.
export const PRIORITY_WEIGHTS = {
  CRITICAL: 16,
  HIGH: 8,
  NORMAL: 4,
  LOW: 2,
  BACKGROUND: 1,
};

export const EVENT_STATUSES = [
  "received",
  "published",
  "scheduled",
  "retried",
  "processed",
  "failed",
  "discarded",
  "restored",
];

// === Subscription ===

export const SUBSCRIPTION_FIELDS = [
  "subscriptionId",
  "createdAt",
  "consumerName",
  "eventType",
  "active",
  "paused",
  "metadata",
];

// === Registry Participant ===

export const PARTICIPANT_KINDS = [
  "publisher",
  "consumer",
  "engine",
  "connector",
  "service",
  "specialist",
];

// === Deterministic ID generation ===

let _eventIdCounter = 0;
let _subscriptionIdCounter = 0;
let _historyIdCounter = 0;
let _participantIdCounter = 0;

export function generateEventId() {
  _eventIdCounter++;
  return `evt-${_eventIdCounter}`;
}

export function generateSubscriptionId() {
  _subscriptionIdCounter++;
  return `sub-${_subscriptionIdCounter}`;
}

export function generateHistoryId() {
  _historyIdCounter++;
  return `his-${_historyIdCounter}`;
}

export function generateParticipantId() {
  _participantIdCounter++;
  return `par-${_participantIdCounter}`;
}

export function _resetIdsForTests() {
  _eventIdCounter = 0;
  _subscriptionIdCounter = 0;
  _historyIdCounter = 0;
  _participantIdCounter = 0;
}

// === Helpers ===

function _deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.keys(value).forEach((key) => _deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

// === Builders ===

export function buildEvent({
  eventType,
  priority,
  companyId,
  tenantId,
  userId,
  sessionId,
  correlationId,
  connectorId,
  source,
  target,
  payload,
  metadata,
} = {}) {
  if (!eventType || typeof eventType !== "string") {
    throw new Error("event eventType is required");
  }
  const pr = PRIORITIES.includes(priority) ? priority : "NORMAL";

  return Object.freeze({
    eventId: generateEventId(),
    eventType,
    priority: pr,
    timestamp: new Date().toISOString(),
    companyId: companyId != null ? String(companyId) : "",
    tenantId: tenantId != null ? String(tenantId) : "",
    userId: userId != null ? String(userId) : "",
    sessionId: sessionId != null ? String(sessionId) : "",
    correlationId: correlationId != null ? String(correlationId) : "",
    connectorId: connectorId != null ? String(connectorId) : "",
    source: typeof source === "string" ? source : "",
    target: typeof target === "string" ? target : "",
    payload: payload != null ? _deepFreeze(payload) : Object.freeze({}),
    metadata: metadata && typeof metadata === "object" ? _deepFreeze(metadata) : Object.freeze({}),
  });
}

export function buildSubscription({
  consumerName,
  eventType,
  active,
  paused,
  metadata,
} = {}) {
  if (!consumerName || typeof consumerName !== "string") {
    throw new Error("subscription consumerName is required");
  }
  if (!eventType || typeof eventType !== "string") {
    throw new Error("subscription eventType is required");
  }
  return Object.freeze({
    subscriptionId: generateSubscriptionId(),
    createdAt: new Date().toISOString(),
    consumerName,
    eventType,
    active: active === undefined ? true : Boolean(active),
    paused: paused === undefined ? false : Boolean(paused),
    metadata: metadata && typeof metadata === "object" ? _deepFreeze(metadata) : Object.freeze({}),
  });
}

export function buildHistoryEntry({ eventId, status, detail } = {}) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("history eventId is required");
  }
  if (!EVENT_STATUSES.includes(status)) {
    throw new Error(`invalid history status: ${status}`);
  }
  return Object.freeze({
    historyId: generateHistoryId(),
    eventId,
    status,
    detail: typeof detail === "string" ? detail : "",
    recordedAt: new Date().toISOString(),
  });
}

export function buildParticipant({ kind, name, metadata } = {}) {
  if (!PARTICIPANT_KINDS.includes(kind)) {
    throw new Error(`invalid participant kind: ${kind}`);
  }
  if (!name || typeof name !== "string") {
    throw new Error("participant name is required");
  }
  return Object.freeze({
    participantId: generateParticipantId(),
    kind,
    name,
    registeredAt: new Date().toISOString(),
    active: true,
    metadata: metadata && typeof metadata === "object" ? _deepFreeze(metadata) : Object.freeze({}),
  });
}