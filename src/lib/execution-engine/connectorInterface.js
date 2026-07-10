/**
 * Connector Interface (Sprint 17)
 *
 * Interface abstrata entre o Execution Engine e os Connectors.
 *
 * O Execution Engine NUNCA conhece:
 *   - Wooba, Sabre, Shopify, Gmail, Mercado Pago, Stone, GitHub, etc.
 *   - Qualquer API específica.
 *   - Qualquer detalhe de implementação de Provider.
 *
 * Ele apenas chama a Interface e aguarda o resultado.
 *
 * Princípio:
 *   Execution Engine → ConnectorInterface → ProviderAdapter → Sistema Externo
 */

import { deepFreeze } from "./executionContracts.js";

// ─── Connector Interface Contract ─────────────────────────────────────────────

/**
 * Toda Capability executada pelo Execution Engine deve conformar este contrato.
 *
 * O Connector Interface é um adaptador entre o plano abstrato e
 * a implementação concreta do Provider.
 */
export const CONNECTOR_INTERFACE_SCHEMA = Object.freeze({
  connectorId:       "string — ID único do Connector",
  capabilityId:      "string — capability sendo executada",
  execute:           "function(input, ctx) → Promise<ConnectorResult>",
  rollback:          "function(executionRef, ctx) → Promise<RollbackResult>",
  validate:          "function(input) → ValidationResult",
  getMetadata:       "function() → ConnectorMetadata",
});

// ─── Connector Metadata ───────────────────────────────────────────────────────

export function buildConnectorMetadata({
  connectorId,
  capabilityId,
  displayName,
  providerId        = null,
  supportsRollback  = false,
  timeoutMs         = 30_000,
  maxRetries        = 3,
  rateLimitPerMin   = 60,
  requiresApproval  = false,
  requiresRiskCheck = false,
  version           = "1.0.0",
}) {
  if (!connectorId)  throw new Error("ConnectorMetadata: connectorId is required");
  if (!capabilityId) throw new Error("ConnectorMetadata: capabilityId is required");
  if (!displayName)  throw new Error("ConnectorMetadata: displayName is required");

  return deepFreeze({
    connectorId:      String(connectorId),
    capabilityId:     String(capabilityId),
    displayName:      String(displayName),
    providerId:       providerId ? String(providerId) : null,
    supportsRollback: Boolean(supportsRollback),
    timeoutMs:        Math.max(1_000, Number(timeoutMs) || 30_000),
    maxRetries:       Math.max(0, Number(maxRetries) || 0),
    rateLimitPerMin:  Math.max(1, Number(rateLimitPerMin) || 60),
    requiresApproval: Boolean(requiresApproval),
    requiresRiskCheck: Boolean(requiresRiskCheck),
    version:          String(version),
  });
}

// ─── Connector Result ─────────────────────────────────────────────────────────

export function buildConnectorResult({
  connectorId,
  capabilityId,
  success,
  outputData     = null,
  error          = null,
  errorType      = null,
  durationMs     = 0,
  executionRef   = null,   // referência para rollback
  httpStatus     = null,
  retryable      = false,
}) {
  if (!connectorId)  throw new Error("ConnectorResult: connectorId is required");
  if (!capabilityId) throw new Error("ConnectorResult: capabilityId is required");

  return deepFreeze({
    connectorId:  String(connectorId),
    capabilityId: String(capabilityId),
    success:      Boolean(success),
    outputData:   outputData  ?? null,
    error:        error       ?? null,
    errorType:    errorType   ?? null,
    durationMs:   Math.max(0, Number(durationMs) || 0),
    executionRef: executionRef ?? null,
    httpStatus:   httpStatus   !== null ? Number(httpStatus) : null,
    retryable:    Boolean(retryable),
    respondedAt:  new Date().toISOString(),
  });
}

// ─── Rollback Result ──────────────────────────────────────────────────────────

export function buildRollbackResult({ connectorId, capabilityId, success, executionRef, error = null, durationMs = 0 }) {
  if (!connectorId)  throw new Error("RollbackResult: connectorId is required");
  if (!capabilityId) throw new Error("RollbackResult: capabilityId is required");

  return deepFreeze({
    connectorId:  String(connectorId),
    capabilityId: String(capabilityId),
    success:      Boolean(success),
    executionRef: executionRef ?? null,
    error:        error        ?? null,
    durationMs:   Math.max(0, Number(durationMs) || 0),
    rolledBackAt: new Date().toISOString(),
  });
}

// ─── Provider Adapter Interface ───────────────────────────────────────────────

/**
 * Contrato do Provider Adapter.
 *
 * O Provider Adapter traduz comandos genéricos para comandos específicos.
 *
 * Exemplo:
 *   createReservation(input) → Wooba API
 *   createReservation(input) → Sabre Host
 *
 * O Execution Engine nunca conhece o Provider concreto.
 */
export const PROVIDER_ADAPTER_SCHEMA = Object.freeze({
  providerId:    "string — ID do Provider",
  capabilityId:  "string — capability que este adapter implementa",
  execute:       "function(genericInput, ctx) → Promise<ProviderResult>",
  rollback:      "function(executionRef, ctx) → Promise<RollbackResult>",
  healthCheck:   "function() → Promise<HealthResult>",
  getMetadata:   "function() → ProviderMetadata",
});

// ─── Provider Metadata ────────────────────────────────────────────────────────

export function buildProviderMetadata({
  providerId,
  capabilityId,
  displayName,
  systemName,
  supportsRollback = false,
  timeoutMs        = 20_000,
  version          = "1.0.0",
}) {
  if (!providerId)   throw new Error("ProviderMetadata: providerId is required");
  if (!capabilityId) throw new Error("ProviderMetadata: capabilityId is required");
  if (!displayName)  throw new Error("ProviderMetadata: displayName is required");
  if (!systemName)   throw new Error("ProviderMetadata: systemName is required");

  return deepFreeze({
    providerId:      String(providerId),
    capabilityId:    String(capabilityId),
    displayName:     String(displayName),
    systemName:      String(systemName),    // nome genérico, sem revelar API interna
    supportsRollback: Boolean(supportsRollback),
    timeoutMs:       Math.max(1_000, Number(timeoutMs) || 20_000),
    version:         String(version),
  });
}

// ─── Connector Registry (Abstrato) ────────────────────────────────────────────

/**
 * Registro em memória de Connectors disponíveis.
 * O Execution Engine consulta este registry para selecionar o Connector
 * adequado para cada capability — nunca instancia Connectors diretamente.
 */
const _connectors   = new Map();
const _providers    = new Map();
let _registrations  = 0;

export function registerConnector(connectorId, connectorInterface) {
  if (!connectorId)         throw new Error("registerConnector: connectorId required");
  if (!connectorInterface)  throw new Error("registerConnector: connectorInterface required");
  if (typeof connectorInterface.execute   !== "function") throw new Error("registerConnector: execute() required");
  if (typeof connectorInterface.getMetadata !== "function") throw new Error("registerConnector: getMetadata() required");

  _connectors.set(String(connectorId), connectorInterface);
  _registrations++;
  return true;
}

export function registerProvider(providerId, providerAdapter) {
  if (!providerId)      throw new Error("registerProvider: providerId required");
  if (!providerAdapter) throw new Error("registerProvider: providerAdapter required");
  if (typeof providerAdapter.execute     !== "function") throw new Error("registerProvider: execute() required");
  if (typeof providerAdapter.getMetadata !== "function") throw new Error("registerProvider: getMetadata() required");

  _providers.set(String(providerId), providerAdapter);
  _registrations++;
  return true;
}

export function getConnector(connectorId) {
  return _connectors.get(String(connectorId)) ?? null;
}

export function getProvider(providerId) {
  return _providers.get(String(providerId)) ?? null;
}

export function listConnectors() {
  return [..._connectors.keys()];
}

export function listProviders() {
  return [..._providers.keys()];
}

export function getConnectorStats() {
  return deepFreeze({
    connectorCount:  _connectors.size,
    providerCount:   _providers.size,
    totalRegistrations: _registrations,
  });
}

export function _resetRegistryForTests() {
  _connectors.clear();
  _providers.clear();
  _registrations = 0;
}