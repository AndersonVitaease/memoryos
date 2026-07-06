/**
 * Connector SDK Framework (Sprint 29)
 *
 * Padrão oficial para desenvolvimento de Connectors do MemoryOS.
 *
 * Após esta Sprint, nenhum Connector poderá ser desenvolvido sem utilizar este SDK.
 *
 * Princípios:
 *   — Totalmente desacoplado
 *   — Determinístico
 *   — Não conhece Engines, Especialistas ou domínio da aplicação
 *   — Não executa IA ou integrações reais
 *   — Conhece apenas: Connectors, Contratos, Hooks, Manifestos
 */

// === Contracts ===
export {
  LIFECYCLE_STATES,
  CATEGORIES,
  CONNECTOR_TYPES,
  SDK_VERSION,
  SDK_COMPATIBILITY_OPERATORS,
  HOOK_NAMES,
  buildManifest,
  nextConnectorId,
  nextManifestId,
  _resetIdsForTests,
} from "./connectorManifest.js";

// === Versioning ===
export {
  parseVersion,
  compareVersions,
  equals,
  newerThan,
  olderThan,
  compatible,
  bumpMajor,
  bumpMinor,
  bumpPatch,
  parseSdkCompatibility,
  checkSdkCompatibility,
  createVersioning,
} from "./connectorVersioning.js";

// === Lifecycle ===
export { canTransition, createLifecycleManager } from "./connectorLifecycle.js";

// === Hooks ===
export { createHookManager } from "./connectorHooks.js";

// === Base Connector ===
export { BaseConnector } from "./baseConnector.js";

// === Builder ===
export { createConnectorBuilder } from "./connectorBuilder.js";

// === Discovery ===
export { createDiscoveryRegistry } from "./connectorDiscovery.js";

// === Loader ===
export { createConnectorLoader } from "./connectorLoader.js";

// === Statistics ===
export { createStatistics } from "./statistics.js";

// === Validators ===
export {
  validateManifest,
  validateConnector,
  validateVersion,
  validateLifecycle,
  createValidators,
} from "./connectorValidators.js";