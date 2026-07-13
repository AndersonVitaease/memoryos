/**
 * PCSTypes.ts — Production Connector Standard Types
 * Beta-01.1 · MemoryOS Production Connector Specification v1.0
 * 2026-07-13
 *
 * These types define the immutable models every production connector must expose.
 * Provider-agnostic: no GitHub, Base44, or any other provider-specific references.
 */

// ── Capability Classification ──────────────────────────────────────────────────

export type CapabilityType =
  | "READ" | "WRITE" | "SEARCH" | "LIST" | "CREATE"
  | "UPDATE" | "DELETE" | "STREAM" | "EVENT" | "SYNC";

export interface ConnectorCapability {
  readonly id: string;           // e.g. "repos.list"
  readonly type: CapabilityType;
  readonly description: string;
  readonly requiredAuth: boolean;
  readonly readOnly: boolean;
  readonly paginated: boolean;
}

// ── Certification Levels ───────────────────────────────────────────────────────

export type CertificationLevel =
  | "LEVEL_0"   // Experimental
  | "LEVEL_1"   // Development
  | "LEVEL_2"   // Beta
  | "LEVEL_3"   // Production
  | "LEVEL_4";  // Certified

export const CERTIFICATION_LABELS: Record<CertificationLevel, string> = {
  LEVEL_0: "Experimental",
  LEVEL_1: "Development",
  LEVEL_2: "Beta",
  LEVEL_3: "Production",
  LEVEL_4: "Certified",
};

export interface ConnectorCertification {
  readonly level: CertificationLevel;
  readonly label: string;
  readonly certifiedAt: number;
  readonly certifiedBy: string;
  readonly validUntil: number | null;
  readonly notes: string[];
}

// ── Health Models ──────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "not_configured";

export interface HealthCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
  readonly latencyMs?: number;
}

export interface ConnectorHealth {
  readonly status: HealthStatus;
  readonly connectorId: string;
  readonly checkedAt: number;
  readonly checks: HealthCheck[];
  readonly overallLatencyMs: number;
  readonly details: string;
}

export interface ConnectorAvailability {
  readonly available: boolean;
  readonly uptimeMs: number;
  readonly lastCheck: number;
  readonly status: HealthStatus;
}

export interface ConnectorLatency {
  readonly avgMs: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly samples: number;
}

// ── Metrics Models ─────────────────────────────────────────────────────────────

export interface ConnectorMetrics {
  readonly connectorId: string;
  readonly totalRequests: number;
  readonly successRequests: number;
  readonly failedRequests: number;
  readonly deniedRequests: number;
  readonly retries: number;
  readonly latency: ConnectorLatency;
  readonly rateLimitRemaining: number | null;
  readonly rateLimitLimit: number | null;
  readonly rateLimitUsagePct: number | null;
  readonly uptimeDurationMs: number;
  readonly perOperation: Record<string, number>;   // op -> call count
}

// ── Permissions Models ─────────────────────────────────────────────────────────

export interface ConnectorPermissions {
  readonly connectorId: string;
  readonly authenticated: boolean;
  readonly principal: string | null;        // e.g. GitHub login, email
  readonly scopes: string[];
  readonly missingRequired: string[];
  readonly recommendations: string[];
  readonly diagnostic: string;
}

// ── Diagnostics Model ──────────────────────────────────────────────────────────

export interface DiagnosticEntry {
  readonly key: string;
  readonly value: string;
  readonly status: "ok" | "warning" | "error" | "info";
}

export interface ConnectorDiagnostics {
  readonly connectorId: string;
  readonly generatedAt: number;
  readonly authentication: DiagnosticEntry[];
  readonly health: DiagnosticEntry[];
  readonly metrics: DiagnosticEntry[];
  readonly capabilities: DiagnosticEntry[];
  readonly errors: DiagnosticEntry[];
  readonly summary: string;
}

// ── Validation Models ──────────────────────────────────────────────────────────

export type ComplianceVerdict = "PASS" | "WARNING" | "FAIL";

export interface ComplianceCheck {
  readonly name: string;
  readonly verdict: ComplianceVerdict;
  readonly detail: string;
  readonly required: boolean;
}

export interface ConnectorValidation {
  readonly connectorId: string;
  readonly validatedAt: number;
  readonly checks: ComplianceCheck[];
  readonly overall: ComplianceVerdict;
  readonly score: number;   // 0.0 – 1.0
  readonly warnings: string[];
  readonly failures: string[];
}

// ── Production Connector Specification (PCS) ──────────────────────────────────

export interface ProductionConnectorSpec {
  readonly specVersion: "1.0";
  readonly generatedAt: number;
  readonly connectorId: string;
  readonly connectorName: string;
  readonly connectorVersion: string;
  readonly description: string;
  readonly author: string;
  readonly capabilities: ConnectorCapability[];
  readonly certificationLevel: CertificationLevel;
  readonly certification: ConnectorCertification;
  readonly validation: ConnectorValidation;
  readonly health: ConnectorHealth;
  readonly metrics: ConnectorMetrics;
  readonly permissions: ConnectorPermissions;
  readonly diagnostics: ConnectorDiagnostics;
  readonly technicalDebt: string[];
  readonly recommendations: string[];
  readonly complianceScore: number;
  readonly isReferenceConnector: boolean;
}

// ── ID helper ──────────────────────────────────────────────────────────────────

let _seq = 0;
export function makePCSId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}