/**
 * CapabilityLifecycleTypes.ts — Engineering Sprint 7.0.2
 * Shared types for the Universal Capability Lifecycle system.
 * Zero dependencies on Core layers.
 */

// ── Lifecycle states ──────────────────────────────────────────────────────────

export type CapabilityState =
  | "draft"
  | "experimental"
  | "internal"
  | "beta"
  | "certified"
  | "production"
  | "enterprise"
  | "deprecated"
  | "disabled";

export const CAPABILITY_STATE_LABELS: Record<CapabilityState, string> = {
  draft:        "Draft",
  experimental: "Experimental",
  internal:     "Internal",
  beta:         "Beta",
  certified:    "Certified",
  production:   "Production",
  enterprise:   "Enterprise",
  deprecated:   "Deprecated",
  disabled:     "Disabled",
};

export const CAPABILITY_STATE_ORDER: CapabilityState[] = [
  "draft", "experimental", "internal", "beta",
  "certified", "production", "enterprise", "deprecated", "disabled",
];

// ── Full capability record ────────────────────────────────────────────────────

export interface CapabilityRecord {
  // Identity
  id:             string;
  serviceId:      string;
  name:           string;
  description:    string;
  owner:          string;
  documentation:  string;

  // Versioning
  version:        string;
  introducedIn:   string;   // sprint/release label
  deprecatedIn:   string | null;

  // Lifecycle
  state:          CapabilityState;
  requiredScopes: string[];
  dependencies:   string[];  // other capability ids

  // Certification
  lastCertification: number | null;  // epoch ms
  certified:         boolean;

  // Metrics (updated on each execution)
  lastExecution:  number | null;
  executionCount: number;
  successCount:   number;
  failureCount:   number;
  totalLatencyMs: number;

  // Timestamps
  createdAt:  number;
  updatedAt:  number;
}

// ── Derived metrics (computed on read) ────────────────────────────────────────

export interface CapabilityMetrics {
  successRate:    number;   // 0-1
  averageLatency: number;   // ms
  p95Latency:     number;   // ms (approximated)
}

// ── Audit entry ───────────────────────────────────────────────────────────────

export interface CapabilityAuditEntry {
  id:           string;
  capabilityId: string;
  serviceId:    string;
  version:      string;
  state:        CapabilityState;
  executedBy:   string;
  executedAt:   number;
  durationMs:   number;
  success:      boolean;
  errorCode:    string | null;
  errorMsg:     string | null;
}

// ── Policy result ─────────────────────────────────────────────────────────────

export interface PolicyResult {
  allowed:  boolean;
  warning:  string | null;
  blocked:  boolean;
  reason:   string;
}