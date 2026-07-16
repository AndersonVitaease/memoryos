/**
 * CCCTypes.ts — Engineering Sprint E-03.3
 * Continuous Connector Certification — Shared Type Definitions
 */

// ── Certification States ──────────────────────────────────────────────────────

export type CertificationState =
  | "draft"
  | "engineering_ready"
  | "testing_ready"
  | "certification_required"
  | "certification_running"
  | "certification_failed"
  | "certification_passed"
  | "production_ready"
  | "enterprise_ready";

export const CERT_STATE_LABELS: Record<CertificationState, string> = {
  draft:                   "Draft",
  engineering_ready:       "Engineering Ready",
  testing_ready:           "Testing Ready",
  certification_required:  "Certification Required",
  certification_running:   "Certification Running",
  certification_failed:    "Certification Failed",
  certification_passed:    "Certification Passed",
  production_ready:        "Production Ready",
  enterprise_ready:        "Enterprise Ready",
};

export const CERT_STATE_ORDER: CertificationState[] = [
  "draft",
  "engineering_ready",
  "testing_ready",
  "certification_required",
  "certification_running",
  "certification_failed",
  "certification_passed",
  "production_ready",
  "enterprise_ready",
];

// ── Invalidation Triggers ─────────────────────────────────────────────────────

export type InvalidationTrigger =
  | "connector_changed"
  | "capability_changed"
  | "alias_registry_changed"
  | "domain_registry_changed"
  | "query_builder_changed"
  | "query_executor_changed"
  | "config_changed"
  | "dependency_changed"
  | "manual_reset"
  | "cert_expired";

// ── Core Records ──────────────────────────────────────────────────────────────

export interface ConnectorVersion {
  connectorId:  string;
  version:      string;         // semver e.g. "1.2.3"
  buildId:      string;
  commit:       string;
  changedFiles: string[];
  changedAt:    number;         // epoch ms
  author:       string;
  changelog:    string;
}

export interface CertificationEvidence {
  reportJson:   unknown;
  perfStats:    { avg: number; p95: number; p99: number };
  precision:    number;
  recall:       number;
  fpPct:        number;
  fnPct:        number;
  phaseLogs:    Record<string, string[]>;
  e2eSteps:     Array<{ step: string; status: string; detail: string }>;
  capturedAt:   number;
}

export interface CertificationRun {
  runId:          string;
  connectorId:    string;
  version:        string;
  state:          CertificationState;
  startedAt:      number;
  completedAt:    number | null;
  durationMs:     number | null;
  author:         string;
  passed:         boolean | null;
  failureReasons: string[];
  evidence:       CertificationEvidence | null;
  buildId:        string;
}

export interface ConnectorCertificationRecord {
  connectorId:       string;
  displayName:       string;
  currentVersion:    string;
  currentState:      CertificationState;
  lastCertRunId:     string | null;
  lastCertAt:        number | null;
  lastPassedAt:      number | null;
  nextRequiredBy:    number | null;   // epoch ms — null = no expiry set
  invalidatedBy:     InvalidationTrigger | null;
  invalidatedAt:     number | null;
  history:           CertificationRun[];
  createdAt:         number;
  updatedAt:         number;
}

// ── Policy ────────────────────────────────────────────────────────────────────

export interface CertificationPolicy {
  connectorId:          string;
  maxCertAgeMs:         number;    // how long a cert stays valid (default 7 days)
  minPrecision:         number;    // 0-1
  minRecall:            number;
  maxFalsePositivePct:  number;
  maxFalseNegativePct:  number;
  maxAvgApiMs:          number;
  maxP95Ms:             number;
  requiredPhases:       string[];
  qualityGateEnabled:   boolean;
}

export const DEFAULT_POLICY: Omit<CertificationPolicy, "connectorId"> = {
  maxCertAgeMs:         7 * 24 * 60 * 60 * 1000,   // 7 days
  minPrecision:         0.95,
  minRecall:            0.95,
  maxFalsePositivePct:  2,
  maxFalseNegativePct:  2,
  maxAvgApiMs:          1500,
  maxP95Ms:             3000,
  requiredPhases:       ["inventory", "discovery", "validation", "e2e"],
  qualityGateEnabled:   true,
};