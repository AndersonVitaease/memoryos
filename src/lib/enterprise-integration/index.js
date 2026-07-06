/**
 * Enterprise Integration Layer — Public API (Sprint 27)
 *
 * Ponto de entrada público da EIL.
 * Toda integração futura deverá utilizar obrigatoriamente esta camada.
 */

// === Contracts ===
export {
  CONNECTOR_FIELDS,
  CONNECTOR_STATUSES,
  AUTHENTICATION_TYPES,
  CAPABILITIES,
  PERMISSION_TYPES,
  PERMISSION_SCOPES,
  EVENT_FIELDS,
  ACTION_FIELDS,
  EVENT_TYPES,
  ACTION_TYPES,
  SCOPE_SPECIFICITY,
  buildConnector,
  buildEvent,
  buildAction,
  buildPermission,
  _resetIdsForTests,
} from "./contracts.js";

// === Connector Builder ===
export {
  createConnector,
  cloneConnector,
  updateConnector,
  freezeConnector,
  setStatus,
} from "./connectorBuilder.js";

// === Connector Registry ===
export { createConnectorRegistry } from "./connectorRegistry.js";

// === Connector Capabilities ===
export {
  isValidCapability,
  validateCapabilitySet,
  hasCapability,
  hasAllCapabilities,
  hasAnyCapability,
  describeCapabilities,
  listCapabilities,
} from "./connectorCapabilities.js";

// === Authentication Manager ===
export { createAuthenticationManager } from "./authenticationManager.js";

// === Permission Manager ===
export { createPermissionManager } from "./permissionManager.js";

// === Event Dispatcher ===
export { createEventDispatcher } from "./eventDispatcher.js";

// === Action Dispatcher ===
export { createActionDispatcher } from "./actionDispatcher.js";

// === Validators ===
export {
  validateConnector,
  validateEvent,
  validateAction,
  validatePermissions,
  validateAuthentication,
  validateCapabilities,
  validateEventType,
  validateActionType,
} from "./validators.js";

// === Statistics ===
export { createStatistics } from "./statistics.js";

// === Integration Engine ===
export { createIntegrationEngine } from "./integrationEngine.js";

// === Tests ===
export {
  ENTERPRISE_INTEGRATION_TEST_CASES,
  runEnterpriseIntegrationTests,
} from "./tests/testCases.js";