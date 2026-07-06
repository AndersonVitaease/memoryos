/**
 * Simulated Response (Sprint 30)
 *
 * Criação de respostas simuladas para ações.
 *
 * IDs são sequenciais (sim-resp-#).
 * Objetos são deep-frozen.
 */

import {
  RESPONSE_STATUSES,
  deepFreeze,
  nextSimResponseId,
} from "./simulatorContracts.js";

export function buildSimulatedResponse({
  actionId,
  status,
  data,
  error,
  latencyMs,
  connectorId,
} = {}) {
  const respStatus = RESPONSE_STATUSES.includes(status) ? status : "SUCCESS";

  return Object.freeze({
    responseId: nextSimResponseId(),
    actionId: actionId != null ? String(actionId) : "",
    status: respStatus,
    data: data != null ? deepFreeze(data) : Object.freeze({}),
    error: typeof error === "string" ? error : "",
    latencyMs: typeof latencyMs === "number" ? latencyMs : 0,
    connectorId: connectorId != null ? String(connectorId) : "",
    timestamp: new Date().toISOString(),
  });
}