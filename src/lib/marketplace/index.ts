/**
 * index.ts — P7 Marketplace Registry
 * Exports oficiais do modulo Marketplace.
 * MDS v2.0 · P7 · Version: 1.0.0
 */

export { CapabilityRegistry } from "./CapabilityRegistry";
export { bootstrapOfficialCapabilities } from "./CapabilityBootstrap";
export { runMarketplaceTests } from "./marketplaceTests";
export type {
  CapabilityManifest,
  CapabilityKind,
  CertificationTier,
  CapabilityStatus,
  CapabilityHealthStatus,
  CompatibilityConstraint,
  RegistryEntry,
  MarketplaceQuery,
  PublishRequest,
  PublishResult,
} from "./MarketplaceTypes";