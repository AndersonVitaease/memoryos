/**
 * Simulated Action (Sprint 30)
 *
 * Criação de ações simuladas seguindo o Action Contract
 * do Enterprise Integration Layer.
 *
 * IDs são sequenciais (sim-act-#).
 * Objetos são deep-frozen.
 */

import { deepFreeze, nextSimActionId } from "./simulatorContracts.js";

export function buildSimulatedAction({
  actionType,
  actionVersion,
  connectorId,
  payload,
  metadata,
  companyId,
  tenantId,
  userId,
  sessionId,
} = {}) {
  if (!actionType || typeof actionType !== "string") {
    throw new Error("simulated action actionType is required");
  }

  return Object.freeze({
    actionId: nextSimActionId(),
    actionVersion: typeof actionVersion === "string" ? actionVersion : "1.0.0",
    actionType,
    timestamp: new Date().toISOString(),
    companyId: companyId != null ? String(companyId) : "",
    tenantId: tenantId != null ? String(tenantId) : "",
    connectorId: connectorId != null ? String(connectorId) : "",
    sessionId: sessionId != null ? String(sessionId) : "",
    userId: userId != null ? String(userId) : "",
    payload: payload != null ? deepFreeze(payload) : Object.freeze({}),
    metadata: metadata && typeof metadata === "object" ? deepFreeze(metadata) : Object.freeze({}),
  });
}