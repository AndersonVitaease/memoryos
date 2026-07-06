/**
 * Connector Simulator — Contracts (Sprint 30)
 *
 * Contratos imutáveis para o Connector Simulator Framework.
 *
 * NÃO conhece: Engines, Especialistas, domínio da aplicação, memória, IA.
 * Conhece apenas: Connectors, Eventos, Ações, Cenários — e contratos públicos
 * do Universal Event Bus, Enterprise Integration Layer e Connector SDK.
 *
 * Todos os objetos são Object.freeze().
 * Todos os IDs são sequenciais (nenhum UUID, Math.random ou Date.now como ID).
 */

// === Public Contract Imports (compatibility) ===

import {
  EVENT_FIELDS as UEB_EVENT_FIELDS,
  PRIORITIES as UEB_PRIORITIES,
  EVENT_STATUSES as UEB_EVENT_STATUSES,
} from "@/lib/universal-event-bus/eventBusContracts.js";

import {
  ACTION_FIELDS as EIL_ACTION_FIELDS,
  EVENT_TYPES as EIL_EVENT_TYPES,
  ACTION_TYPES as EIL_ACTION_TYPES,
  AUTHENTICATION_TYPES as EIL_AUTH_TYPES,
  CAPABILITIES as EIL_CAPABILITIES,
  CONNECTOR_STATUSES as EIL_CONNECTOR_STATUSES,
} from "@/lib/enterprise-integration/contracts.js";

import {
  LIFECYCLE_STATES as CSF_LIFECYCLE_STATES,
  CATEGORIES as CSF_CATEGORIES,
  CONNECTOR_TYPES as CSF_CONNECTOR_TYPES,
} from "@/lib/connector-sdk/connectorManifest.js";

// === Re-exported Contract Constants ===

export const EVENT_FIELDS = UEB_EVENT_FIELDS;
export const PRIORITIES = UEB_PRIORITIES;
export const EVENT_STATUSES = UEB_EVENT_STATUSES;

export const ACTION_FIELDS = EIL_ACTION_FIELDS;
export const EVENT_TYPES = EIL_EVENT_TYPES;
export const ACTION_TYPES = EIL_ACTION_TYPES;
export const AUTHENTICATION_TYPES = EIL_AUTH_TYPES;
export const CAPABILITIES = EIL_CAPABILITIES;
export const CONNECTOR_STATUSES = EIL_CONNECTOR_STATUSES;

export const LIFECYCLE_STATES = CSF_LIFECYCLE_STATES;
export const CATEGORIES = CSF_CATEGORIES;
export const CONNECTOR_TYPES = CSF_CONNECTOR_TYPES;

// === Simulator-Specific Constants ===

export const LATENCY_PRESETS = [
  { label: "INSTANT", latencyMs: 0 },
  { label: "FAST", latencyMs: 100 },
  { label: "NORMAL", latencyMs: 500 },
  { label: "SLOW", latencyMs: 1000 },
  { label: "VERY_SLOW", latencyMs: 5000 },
];

export const LATENCY_LABELS = LATENCY_PRESETS.map((p) => p.label);

export const FAILURE_TYPES = [
  "TIMEOUT",
  "AUTHENTICATION_ERROR",
  "PERMISSION_ERROR",
  "CONNECTOR_OFFLINE",
  "INVALID_RESPONSE",
  "UNKNOWN_ERROR",
];

export const FAILURE_MESSAGES = {
  TIMEOUT: "Simulated timeout",
  AUTHENTICATION_ERROR: "Simulated authentication failure",
  PERMISSION_ERROR: "Simulated permission denied",
  CONNECTOR_OFFLINE: "Simulated connector offline",
  INVALID_RESPONSE: "Simulated invalid response",
  UNKNOWN_ERROR: "Simulated unknown error",
};

export const RESPONSE_STATUSES = ["SUCCESS", "FAILURE", "PARTIAL", "TIMEOUT"];

export const SCENARIO_STATUSES = ["DRAFT", "READY", "EXECUTING", "COMPLETED", "FAILED"];

export const SIMULATION_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];

export const SIMULATED_CONNECTOR_STATES = ["CREATED", "CONNECTED", "DISCONNECTED"];

// === Deterministic Sequential ID Generation ===

let _simConnectorIdCounter = 0;
let _simEventIdCounter = 0;
let _simActionIdCounter = 0;
let _simResponseIdCounter = 0;
let _simFailureIdCounter = 0;
let _simScenarioIdCounter = 0;
let _simExecutionIdCounter = 0;
let _simStepIdCounter = 0;

export function nextSimConnectorId() {
  _simConnectorIdCounter++;
  return `sim-conn-${_simConnectorIdCounter}`;
}

export function nextSimEventId() {
  _simEventIdCounter++;
  return `sim-evt-${_simEventIdCounter}`;
}

export function nextSimActionId() {
  _simActionIdCounter++;
  return `sim-act-${_simActionIdCounter}`;
}

export function nextSimResponseId() {
  _simResponseIdCounter++;
  return `sim-resp-${_simResponseIdCounter}`;
}

export function nextSimFailureId() {
  _simFailureIdCounter++;
  return `sim-fail-${_simFailureIdCounter}`;
}

export function nextSimScenarioId() {
  _simScenarioIdCounter++;
  return `sim-scn-${_simScenarioIdCounter}`;
}

export function nextSimExecutionId() {
  _simExecutionIdCounter++;
  return `sim-exec-${_simExecutionIdCounter}`;
}

export function nextSimStepId() {
  _simStepIdCounter++;
  return `sim-step-${_simStepIdCounter}`;
}

export function _resetIdsForTests() {
  _simConnectorIdCounter = 0;
  _simEventIdCounter = 0;
  _simActionIdCounter = 0;
  _simResponseIdCounter = 0;
  _simFailureIdCounter = 0;
  _simScenarioIdCounter = 0;
  _simExecutionIdCounter = 0;
  _simStepIdCounter = 0;
}

// === Deep Freeze Helper ===

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}