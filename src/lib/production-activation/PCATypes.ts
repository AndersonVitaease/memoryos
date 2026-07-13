/**
 * PCATypes.ts — Production Connector Activation Types
 * Beta-03.3 · MemoryOS · 2026-07-13
 *
 * All domain models for the Production Activation sprint.
 * Read-only — no write operations anywhere in this module.
 */

// ── IDs ────────────────────────────────────────────────────────────────────────

let _seq = 0;
export function makePCAId(prefix: string): string {
  return `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;
}

// ── Check result ──────────────────────────────────────────────────────────────

export type CheckStatus = "PASS" | "FAIL" | "WARNING" | "SKIP" | "NOT_CONFIGURED";

export interface ActivationCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly durationMs: number;
  readonly evidence: string;
}

// ── Connector Activation Report ───────────────────────────────────────────────

export type ConnectorActivationStatus = "ACTIVATED" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";

export interface ConnectorActivationReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly connector: "github" | "base44";
  readonly status: ConnectorActivationStatus;
  readonly checks: readonly ActivationCheck[];
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly notConfiguredCount: number;
  readonly totalChecks: number;
  readonly latencyMs: number;
  readonly summary: string;
  readonly evidence: readonly string[];
}

// ── Repository Analysis Validation ────────────────────────────────────────────

export interface RepoAnalysisValidation {
  readonly analysisId: string;
  readonly owner: string;
  readonly repo: string;
  readonly consistent: boolean;
  readonly fields: Array<{ field: string; value: unknown; pass: boolean }>;
  readonly durationMs: number;
}

// ── Application Analysis Validation ───────────────────────────────────────────

export interface AppAnalysisValidation {
  readonly analysisId: string;
  readonly consistent: boolean;
  readonly fields: Array<{ field: string; value: unknown; pass: boolean }>;
  readonly durationMs: number;
}

// ── Project Snapshot ──────────────────────────────────────────────────────────

export interface ProjectSnapshot {
  readonly id: string;
  readonly generatedAt: number;
  readonly snapshotVersion: string;

  // GitHub
  readonly githubOwner: string | null;
  readonly githubRepo: string | null;
  readonly githubBranches: number;
  readonly githubCommits: number;
  readonly githubFiles: number;
  readonly githubLanguages: string[];
  readonly githubLastActivity: string | null;

  // Base44
  readonly base44UserId: string;
  readonly base44UserEmail: string;
  readonly base44Projects: number;
  readonly base44Sessions: number;
  readonly base44EntityCounts: Record<string, number>;

  // Pipeline
  readonly kreNodesLinked: number;
  readonly kfeRelationsLinked: number;
  readonly ireIdentitiesLinked: number;
  readonly preComponentsLinked: number;

  // Provenance
  readonly sources: Array<{ connector: string; operationCount: number; latencyMs: number }>;
  readonly pipelineStatus: "COMPLETE" | "PARTIAL" | "FAILED";
  readonly readOnlyCertified: boolean;
}

// ── Production Diagnostics ────────────────────────────────────────────────────

export interface ProductionDiagnosticsReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly githubStatus: ConnectorActivationStatus;
  readonly base44Status: ConnectorActivationStatus;
  readonly githubLatencyMs: number;
  readonly base44LatencyMs: number;
  readonly githubRateLimitRemaining: number | null;
  readonly githubRateLimitLimit: number | null;
  readonly githubLogin: string | null;
  readonly base44Email: string | null;
  readonly warnings: string[];
  readonly overallHealth: "healthy" | "degraded" | "unhealthy";
}

// ── Read-Only Certification ───────────────────────────────────────────────────

export interface ReadOnlyCertification {
  readonly id: string;
  readonly certifiedAt: number;
  readonly certified: boolean;
  readonly level: "CERTIFIED" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";
  readonly githubWriteOpsDetected: boolean;
  readonly base44WriteOpsDetected: boolean;
  readonly evidence: string[];
  readonly summary: string;
}

// ── Full Activation Report ─────────────────────────────────────────────────────

export interface FullActivationReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly certificationLevel: "CERTIFIED" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";
  readonly certified: boolean;

  readonly githubReport: ConnectorActivationReport;
  readonly base44Report: ConnectorActivationReport;
  readonly repoValidation: RepoAnalysisValidation | null;
  readonly appValidation: AppAnalysisValidation | null;
  readonly projectSnapshot: ProjectSnapshot | null;
  readonly diagnostics: ProductionDiagnosticsReport;
  readonly readOnlyCert: ReadOnlyCertification;

  readonly summary: string;
  readonly recommendations: string[];
}