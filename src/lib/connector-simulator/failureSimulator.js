/**
 * Failure Simulator (Sprint 30)
 *
 * Simula falhas de conectores e operações SEM lançar exceções.
 * Retorna descritores de falha determinísticos e frozen.
 *
 * Nenhuma exceção inesperada é lançada.
 */

import {
  FAILURE_TYPES,
  FAILURE_MESSAGES,
  deepFreeze,
  nextSimFailureId,
} from "./simulatorContracts.js";

export function simulateFailure({ type, message, actionId, connectorId } = {}) {
  const failureType = FAILURE_TYPES.includes(type) ? type : "UNKNOWN_ERROR";
  const failureMessage =
    typeof message === "string" && message.length > 0
      ? message
      : FAILURE_MESSAGES[failureType];

  return Object.freeze({
    failureId: nextSimFailureId(),
    type: failureType,
    message: failureMessage,
    actionId: actionId != null ? String(actionId) : "",
    connectorId: connectorId != null ? String(connectorId) : "",
    simulated: true,
    timestamp: new Date().toISOString(),
  });
}

export function buildFailureError(type, message) {
  const failureType = FAILURE_TYPES.includes(type) ? type : "UNKNOWN_ERROR";
  return Object.freeze({
    type: failureType,
    message: typeof message === "string" && message.length > 0 ? message : FAILURE_MESSAGES[failureType],
    simulated: true,
  });
}

export function isFailureType(type) {
  return FAILURE_TYPES.includes(type);
}

export function listFailureTypes() {
  return Object.freeze([...FAILURE_TYPES]);
}

export { FAILURE_TYPES, FAILURE_MESSAGES };