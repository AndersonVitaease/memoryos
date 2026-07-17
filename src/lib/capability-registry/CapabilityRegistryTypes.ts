/**
 * CapabilityRegistryTypes.ts — Sprint C-03.6.1
 * Contratos oficiais do Capability Registry.
 *
 * SRP: apenas tipos — sem lógica.
 */

export type { CapabilityDescriptor } from "@/lib/capability-selection/CapabilitySelectionTypes";

import type { CapabilityDescriptor } from "@/lib/capability-selection/CapabilitySelectionTypes";

// ── Registered Capability ─────────────────────────────────────────────────────

export interface RegisteredCapability {
  readonly descriptor:    Readonly<CapabilityDescriptor>;
  readonly registeredAt:  number;
  readonly version:       string;
}

// ── Discovery Result ──────────────────────────────────────────────────────────

export interface CapabilityDiscoveryResult {
  readonly found:        readonly Readonly<RegisteredCapability>[];
  readonly count:        number;
  readonly criterion:    string;
  readonly criterionValue: string;
  readonly durationMs:   number;
  readonly explanation:  string;
}

// ── Registry Health ───────────────────────────────────────────────────────────

export type RegistryHealthStatus = "READY" | "DEGRADED" | "FAILED";

export interface RegistryHealth {
  readonly status:           RegistryHealthStatus;
  readonly registeredCount:  number;
  readonly totalLookups:     number;
  readonly totalDiscoveries: number;
  readonly totalErrors:      number;
  readonly avgQueryMs:       number;
}

// ── Validation error ──────────────────────────────────────────────────────────

export interface RegistrationError {
  readonly success:  false;
  readonly reason:   "DUPLICATE_ID" | "INVALID_DESCRIPTOR" | "MISSING_FIELD";
  readonly message:  string;
}

export interface RegistrationSuccess {
  readonly success:    true;
  readonly capability: Readonly<RegisteredCapability>;
}

export type RegistrationResult = RegistrationSuccess | RegistrationError;