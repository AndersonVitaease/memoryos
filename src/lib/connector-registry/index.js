/**
 * Connector Registry Engine (Sprint 30)
 *
 * Catálogo oficial de Connectors do MemoryOS.
 *
 * Após esta Sprint, nenhum módulo da plataforma poderá localizar
 * Connectors diretamente. Toda descoberta deverá ocorrer através
 * do Connector Registry Engine.
 *
 * Princípios:
 *   — Completamente desacoplado
 *   — Totalmente determinístico
 *   — Não conhece Engines ou domínio da aplicação
 *   — Não executa IA, HTTP, Banco de Dados ou APIs externas
 *   — IDs sequenciais (nenhum UUID, Math.random ou Date.now como ID)
 *   — Todos os objetos são frozen
 *   — Operações preferencialmente O(1) ou O(log n)
 *   — Indexação lógica para pesquisas
 *
 * Compatível com:
 *   — Enterprise Integration Layer
 *   — Universal Event Bus
 *   — Connector SDK
 */

// === Contracts ===
export {
  CATEGORIES,
  CONNECTOR_TYPES,
  LIFECYCLE_STATES,
  CAPABILITIES,
  PERMISSION_TYPES,
  CONNECTOR_STATUSES,
  AUTHENTICATION_TYPES,
  SDK_VERSION,
  SDK_COMPATIBILITY_OPERATORS,
  REGISTRY_STATUSES,
  HEALTH_STATUSES,
  FILTER_TYPES,
  nextRegistrationId,
  nextConnectorId,
  _resetIdsForTests,
  deepFreeze,
  buildConnectorRecord,
} from "./registryContracts.js";

// === Registry ===
export { createConnectorRegistry } from "./connectorRegistry.js";

// === Catalog ===
export { createConnectorCatalog } from "./connectorCatalog.js";

// === Search ===
export { createConnectorSearch } from "./connectorSearch.js";

// === Lookup ===
export {
  createConnectorLookup,
  hasCapability,
  getCapabilities,
  listCapabilities,
  isCapability,
} from "./connectorLookup.js";

// === Compatibility ===
export {
  parseVersion,
  compareVersions,
  parseSdkCompatibility,
  checkSdkCompatibility,
  checkVersionCompatibility,
  isVersionNewer,
  isVersionOlder,
  checkMemoryOSCompatibility,
  checkCompatibility,
  checkManifestCompatibility,
} from "./connectorCompatibility.js";

// === Filters ===
export {
  filterActive,
  filterInactive,
  filterConnected,
  filterDisconnected,
  filterHealthy,
  filterUnhealthy,
  applyFilters,
  listFilterTypes,
} from "./connectorFilters.js";

// === Statistics ===
export { createStatistics } from "./statistics.js";

// === Validators ===
export {
  validateRegistry,
  validateConnector,
  validateManifest,
  validateCompatibility,
  validateCapability,
  createValidators,
} from "./validators.js";