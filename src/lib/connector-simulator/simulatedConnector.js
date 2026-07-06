/**
 * Simulated Connector (Sprint 30)
 *
 * Simula um Connector com ciclo de vida determinístico:
 *   connect()      — CREATED/DISCONNECTED → CONNECTED
 *   disconnect()   — CONNECTED → DISCONNECTED
 *   publishEvent() — registra evento publicado
 *   receiveAction() — registra ação e retorna resposta simulada
 *
 * Estado interno via closure (mutável internamente, frozen externamente).
 * Nenhuma integração real é executada.
 */

import {
  CATEGORIES,
  CONNECTOR_TYPES,
  AUTHENTICATION_TYPES,
  CAPABILITIES,
  deepFreeze,
  nextSimConnectorId,
} from "./simulatorContracts.js";
import { buildSimulatedResponse } from "./simulatedResponse.js";
import { simulateLatency } from "./latencySimulator.js";

export function createSimulatedConnector({
  connectorName,
  connectorVersion,
  vendor,
  description,
  category,
  connectorType,
  authenticationType,
  supportedEvents,
  supportedActions,
  supportedCapabilities,
  latency,
  metadata,
} = {}) {
  if (!connectorName || typeof connectorName !== "string") {
    throw new Error("simulated connector connectorName is required");
  }

  const _connectorId = nextSimConnectorId();
  let _state = "CREATED";
  const _eventLog = [];
  const _actionLog = [];

  const _latencyResult = simulateLatency(latency || "INSTANT");

  const manifest = deepFreeze({
    connectorId: _connectorId,
    connectorVersion: typeof connectorVersion === "string" ? connectorVersion : "1.0.0",
    connectorName,
    vendor: typeof vendor === "string" ? vendor : "simulated",
    description: typeof description === "string" ? description : "",
    category: CATEGORIES.includes(category) ? category : "other",
    connectorType: CONNECTOR_TYPES.includes(connectorType) ? connectorType : "BIDIRECTIONAL",
    authenticationType: AUTHENTICATION_TYPES.includes(authenticationType)
      ? authenticationType
      : "NONE",
    supportedEvents: Array.isArray(supportedEvents) ? [...supportedEvents] : [],
    supportedActions: Array.isArray(supportedActions) ? [...supportedActions] : [],
    supportedCapabilities: Array.isArray(supportedCapabilities)
      ? supportedCapabilities.filter((c) => CAPABILITIES.includes(c))
      : [],
    latency: _latencyResult,
    metadata: metadata && typeof metadata === "object" ? { ...metadata } : {},
  });

  return Object.freeze({
    connectorId: _connectorId,
    manifest,

    getState() {
      return _state;
    },

    getEventLog() {
      return Object.freeze([..._eventLog]);
    },

    getActionLog() {
      return Object.freeze([..._actionLog]);
    },

    connect() {
      if (_state === "CREATED" || _state === "DISCONNECTED") {
        _state = "CONNECTED";
        return Object.freeze({
          success: true,
          connectorId: _connectorId,
          state: _state,
          latency: _latencyResult,
        });
      }
      return Object.freeze({
        success: false,
        connectorId: _connectorId,
        state: _state,
        error: `Cannot connect from state ${_state}`,
      });
    },

    disconnect() {
      if (_state === "CONNECTED") {
        _state = "DISCONNECTED";
        return Object.freeze({
          success: true,
          connectorId: _connectorId,
          state: _state,
        });
      }
      return Object.freeze({
        success: false,
        connectorId: _connectorId,
        state: _state,
        error: `Cannot disconnect from state ${_state}`,
      });
    },

    publishEvent(event) {
      if (_state !== "CONNECTED") {
        return Object.freeze({
          accepted: false,
          connectorId: _connectorId,
          state: _state,
          error: "Connector not connected",
        });
      }
      _eventLog.push(event);
      return Object.freeze({
        accepted: true,
        eventId: event.eventId,
        eventType: event.eventType,
        connectorId: _connectorId,
        state: _state,
        latency: _latencyResult,
      });
    },

    receiveAction(action) {
      if (_state !== "CONNECTED") {
        return Object.freeze({
          responded: false,
          connectorId: _connectorId,
          state: _state,
          error: "Connector not connected",
        });
      }
      _actionLog.push(action);
      return Object.freeze({
        responded: true,
        actionId: action.actionId,
        actionType: action.actionType,
        connectorId: _connectorId,
        state: _state,
        latency: _latencyResult,
        response: buildSimulatedResponse({
          actionId: action.actionId,
          status: "SUCCESS",
          latencyMs: _latencyResult.latencyMs,
          connectorId: _connectorId,
        }),
      });
    },
  });
}