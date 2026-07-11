// CapabilityRegistryTypes.ts
// Foundation v1.0 · Engineering First · Sprint EF-14

// ── Scalar Types ──────────────────────────────────────────────────────────────

export type CapabilityId       = string;
export type CapabilityName     = string;
export type CapabilityVersion  = string;
export type CapabilityTag      = string;
export type CapabilityOwner    = string;

// ── Enums ─────────────────────────────────────────────────────────────────────

export type CapabilityCategory =
  | "SYSTEM"
  | "MEMORY"
  | "KNOWLEDGE"
  | "LEARNING"
  | "COMMUNICATION"
  | "FILE"
  | "CONNECTOR"
  | "SPECIALIST"
  | "UTILITY";

export type CapabilityStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "DEPRECATED"
  | "DRAFT";

export type CapabilityScope =
  | "PUBLIC"
  | "INTERNAL"
  | "RESTRICTED";

export type CapabilityVisibility =
  | "VISIBLE"
  | "HIDDEN";

export type CapabilityPermission =
  | "READ"
  | "WRITE"
  | "EXECUTE"
  | "ADMIN";

// ── Schema Types ──────────────────────────────────────────────────────────────

export interface CapabilityInputSchema {
  readonly type: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
}

export interface CapabilityOutputSchema {
  readonly type: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface CapabilityContract {
  readonly inputSchema:  CapabilityInputSchema;
  readonly outputSchema: CapabilityOutputSchema;
  readonly version:      CapabilityVersion;
  readonly sideEffects:  boolean;
  readonly idempotent:   boolean;
}

// ── Descriptor ────────────────────────────────────────────────────────────────

export interface CapabilityDescriptor {
  readonly id:          CapabilityId;
  readonly name:        CapabilityName;
  readonly version:     CapabilityVersion;
  readonly category:    CapabilityCategory;
  readonly description: string;
  readonly inputSchema: CapabilityInputSchema;
  readonly outputSchema: CapabilityOutputSchema;
  readonly permissions: readonly CapabilityPermission[];
  readonly status:      CapabilityStatus;
  readonly tags:        readonly CapabilityTag[];
  readonly owner:       CapabilityOwner;
  readonly scope:       CapabilityScope;
  readonly visibility:  CapabilityVisibility;
  readonly createdAt:   number;
  readonly updatedAt:   number;
}

// ── Definition (input for register) ──────────────────────────────────────────

export interface CapabilityDefinition {
  readonly name:        CapabilityName;
  readonly version:     CapabilityVersion;
  readonly category:    CapabilityCategory;
  readonly description: string;
  readonly inputSchema: CapabilityInputSchema;
  readonly outputSchema: CapabilityOutputSchema;
  readonly permissions?: readonly CapabilityPermission[];
  readonly status?:      CapabilityStatus;
  readonly tags?:        readonly CapabilityTag[];
  readonly owner?:       CapabilityOwner;
  readonly scope?:       CapabilityScope;
  readonly visibility?:  CapabilityVisibility;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export interface CapabilityMetadata {
  readonly capabilityId: CapabilityId;
  readonly name:         CapabilityName;
  readonly version:      CapabilityVersion;
  readonly category:     CapabilityCategory;
  readonly status:       CapabilityStatus;
  readonly tags:         readonly CapabilityTag[];
  readonly owner:        CapabilityOwner;
  readonly registeredAt: number;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface CapabilityStatistics {
  readonly totalCapabilities:   number;
  readonly activeCapabilities:  number;
  readonly inactiveCapabilities: number;
  readonly deprecatedCapabilities: number;
  readonly draftCapabilities:   number;
  readonly categories:          Readonly<Record<CapabilityCategory, number>>;
  readonly versions:            number;
  readonly owners:              number;
  readonly registrations:       number;
  readonly updates:             number;
  readonly removals:            number;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface CapabilityMetrics {
  readonly registerTotal:      number;
  readonly resolveTotal:       number;
  readonly validationTotal:    number;
  readonly errorTotal:         number;
  readonly avgResolveTime:     number;
  readonly avgValidationTime:  number;
  readonly unregisterTotal:    number;
  readonly updateTotal:        number;
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface CapabilityHealth {
  readonly status:  "SUCCESS" | "DEGRADED" | "FAILED";
  readonly details: string;
  readonly checks: Readonly<{
    registryIntegrity:   boolean;
    descriptorIntegrity: boolean;
    versionIntegrity:    boolean;
    contractIntegrity:   boolean;
    consistencyCheck:    boolean;
    [key: string]: boolean | string | number;
  }>;
}

// ── Log ───────────────────────────────────────────────────────────────────────

export type CapabilityLogOperation =
  | "REGISTER"
  | "UNREGISTER"
  | "UPDATE"
  | "RESOLVE"
  | "VALIDATE"
  | "CLEAR";

export interface CapabilityLog {
  readonly executionId:   string;
  readonly operation:     CapabilityLogOperation;
  readonly capabilityId:  CapabilityId;
  readonly timestamp:     number;
  readonly durationMs:    number;
  readonly status:        "SUCCESS" | "FAILED";
  readonly error:         string | null;
}

// ── Test Result ───────────────────────────────────────────────────────────────

export interface CapabilityRegistryTestResult {
  readonly criterion:  number;
  readonly name:       string;
  readonly passed:     boolean;
  readonly durationMs: number;
  readonly detail:     string;
  readonly error:      string | null;
}

export interface CapabilityRegistryTestSuite {
  readonly total:      number;
  readonly passed:     number;
  readonly durationMs: number;
  readonly results:    readonly CapabilityRegistryTestResult[];
  readonly statistics: CapabilityStatistics;
  readonly metrics:    CapabilityMetrics;
  readonly health:     CapabilityHealth;
}