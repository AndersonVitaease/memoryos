/**
 * Simulated Event (Sprint 30)
 *
 * Criação de eventos simulados seguindo exatamente o Event Contract
 * do Universal Event Bus (campos, prioridades, statuses).
 *
 * IDs são sequenciais (sim-evt-#).
 * Objetos são deep-frozen.
 */

import {
  PRIORITIES,
  EVENT_STATUSES,
  deepFreeze,
  nextSimEventId,
} from "./simulatorContracts.js";

export function buildSimulatedEvent({
  eventType,
  eventVersion,
  priority,
  status,
  source,
  target,
  payload,
  metadata,
  connectorId,
  correlationId,
  companyId,
  tenantId,
  userId,
  sessionId,
} = {}) {
  if (!eventType || typeof eventType !== "string") {
    throw new Error("simulated event eventType is required");
  }

  const pr = PRIORITIES.includes(priority) ? priority : "NORMAL";
  const st = EVENT_STATUSES.includes(status) ? status : "CREATED";

  return Object.freeze({
    eventId: nextSimEventId(),
    eventVersion: typeof eventVersion === "string" ? eventVersion : "1.0.0",
    correlationId: correlationId != null ? String(correlationId) : "",
    eventType,
    source: typeof source === "string" ? source : "",
    target: typeof target === "string" ? target : "",
    priority: pr,
    status: st,
    timestamp: new Date().toISOString(),
    payload: payload != null ? deepFreeze(payload) : Object.freeze({}),
    metadata: metadata && typeof metadata === "object" ? deepFreeze(metadata) : Object.freeze({}),
    companyId: companyId != null ? String(companyId) : "",
    tenantId: tenantId != null ? String(tenantId) : "",
    userId: userId != null ? String(userId) : "",
    sessionId: sessionId != null ? String(sessionId) : "",
    connectorId: connectorId != null ? String(connectorId) : "",
  });
}