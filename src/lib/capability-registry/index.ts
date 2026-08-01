/**
 * index.ts — P9 Capability Registry
 * Exports oficiais do modulo Capability Registry.
 * MDS v2.0 · P9 · Version: 1.0.0
 */

export { CapabilityDiscoveryEngine } from "./CapabilityDiscoveryEngine";
export { CapabilityVersioning }      from "./CapabilityVersioning";
export { CompatibilityMatrixEngine } from "./CompatibilityMatrix";
export { runCapabilityRegistryTests } from "./capabilityRegistryTests";
export type {
  DiscoveredCapability,
  DiscoveryReport,
  DiscoverySource,
  VersionRecord,
  VersionBump,
  VersioningReport,
  CompatibilityEntry,
  CompatibilityLevel,
  CompatibilityMatrix,
  CapabilityRegistryHealth,
  CapabilityRegistryMetrics,
} from "./CapabilityRegistryTypes";