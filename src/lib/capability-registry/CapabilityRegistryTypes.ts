/**
 * CapabilityRegistryTypes.ts — P9 Capability Registry
 * Tipos imutaveis para Discovery, Versioning e Compatibility Matrix.
 * MDS v2.0 · P9 · Version: 1.0.0
 */

export type DiscoverySource = "bootstrap" | "marketplace" | "dynamic" | "manual";

export type VersionBump = "major" | "minor" | "patch";

export type CompatibilityLevel = "full" | "partial" | "none";

export interface DiscoveredCapability {
  readonly id: string;
  readonly kind: "specialist" | "knowledge_package" | "connector";
  readonly version: string;
  readonly domain: string;
  readonly source: DiscoverySource;
  readonly discoveredAt: string;
  readonly healthy: boolean;
}

export interface VersionRecord {
  readonly capabilityId: string;
  readonly version: string;
  readonly previousVersion: string | null;
  readonly bump: VersionBump;
  readonly publishedAt: string;
  readonly changelog: string;
  readonly deprecated: boolean;
}

export interface CompatibilityEntry {
  readonly idA: string;
  readonly idB: string;
  readonly level: CompatibilityLevel;
  readonly reason: string;
  readonly testedAt: string;
}

export interface DiscoveryReport {
  readonly total: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly bySource: Readonly<Record<string, number>>;
  readonly discoveredAt: string;
  readonly capabilities: readonly DiscoveredCapability[];
}

export interface VersioningReport {
  readonly capabilityId: string;
  readonly currentVersion: string;
  readonly history: readonly VersionRecord[];
  readonly totalVersions: number;
}

export interface CompatibilityMatrix {
  readonly entries: readonly CompatibilityEntry[];
  readonly generatedAt: string;
  readonly totalPairs: number;
  readonly fullCompatible: number;
  readonly partialCompatible: number;
  readonly incompatible: number;
}

export interface CapabilityRegistryHealth {
  readonly status: "SUCCESS" | "DEGRADED" | "FAILED";
  readonly totalDiscovered: number;
  readonly totalVersioned: number;
  readonly matrixSize: number;
  readonly checkedAt: string;
}

export interface CapabilityRegistryMetrics {
  readonly discoveryRuns: number;
  readonly versionPublishes: number;
  readonly compatibilityChecks: number;
  readonly avgDiscoveryMs: number;
}