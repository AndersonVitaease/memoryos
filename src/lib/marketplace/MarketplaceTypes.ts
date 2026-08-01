/**
 * MarketplaceTypes.ts — P7 Marketplace Registry
 * Tipos imutaveis para o Marketplace de Capabilities.
 * MDS v2.0 · P7 · Version: 1.0.0
 */

export type CapabilityKind = "specialist" | "knowledge_package" | "connector";

export type CertificationTier = "community" | "verified" | "official";

export type CapabilityStatus = "active" | "deprecated" | "beta" | "archived";

export interface CapabilityManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly kind: CapabilityKind;
  readonly domain: string;
  readonly author: string;
  readonly description: string;
  readonly tier: CertificationTier;
  readonly status: CapabilityStatus;
  readonly languages: readonly string[];
  readonly tags: readonly string[];
  readonly registeredAt: string;
  readonly checksum: string;
}

export interface CompatibilityConstraint {
  readonly capabilityId: string;
  readonly requiresIds: readonly string[];
  readonly conflictsWith: readonly string[];
  readonly minPlatformVersion: string;
}

export interface RegistryEntry {
  readonly manifest: CapabilityManifest;
  readonly compatibility: CompatibilityConstraint;
  readonly healthStatus: CapabilityHealthStatus;
}

export interface CapabilityHealthStatus {
  readonly capabilityId: string;
  readonly healthy: boolean;
  readonly lastCheckedAt: string;
  readonly errorCount: number;
  readonly successRate: number;
  readonly avgLatencyMs: number;
}

export interface MarketplaceQuery {
  readonly kind?: CapabilityKind;
  readonly domain?: string;
  readonly tier?: CertificationTier;
  readonly status?: CapabilityStatus;
  readonly tags?: readonly string[];
}

export interface PublishRequest {
  readonly manifest: Omit<CapabilityManifest, "registeredAt" | "checksum">;
  readonly compatibilityConstraints: Omit<CompatibilityConstraint, "capabilityId">;
}

export interface PublishResult {
  readonly success: boolean;
  readonly capabilityId: string;
  readonly registeredAt: string;
  readonly errors: readonly string[];
}