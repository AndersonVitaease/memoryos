/**
 * GitHubBringUpTypes — Phase 5.3 Type Definitions
 */

export interface ValidationEvidence {
  readonly timestamp: string;
  readonly executionId: string;
  readonly operation: string;
  readonly connector: "github";
  readonly repository: string | null;
  readonly latencyMs: number;
  readonly authState: "AUTHENTICATED" | "NOT_CONFIGURED" | "FAILED";
  readonly status: "SUCCESS" | "FAILED" | "SKIPPED";
  readonly payload: Record<string, unknown>;
}

export interface OperationResult {
  readonly operation: string;
  readonly status: "SUCCESS" | "FAILED" | "SKIPPED";
  readonly detail: string;
  readonly latencyMs: number;
  readonly evidence: ValidationEvidence;
  readonly data?: unknown;
  readonly error?: string;
}

export interface BringUpReport {
  readonly id: string;
  readonly generatedAt: number;
  readonly durationMs: number;
  readonly authState: "AUTHENTICATED" | "NOT_CONFIGURED" | "FAILED";
  readonly login: string | null;
  readonly repository: string | null;
  readonly operations: OperationResult[];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly overallStatus: "OPERATIONAL" | "PARTIAL" | "NOT_CONFIGURED" | "FAILED";
  readonly certificationReady: boolean;
  readonly summary: string;
}

export interface GitHubCertificate {
  readonly certId: string;
  readonly issuedAt: number;
  readonly issuedBy: string;
  readonly connector: string;
  readonly version: string;
  readonly login: string;
  readonly operationsValidated: string[];
  readonly passedCount: number;
  readonly failedCount: number;
  readonly readOnlyVerified: boolean;
  readonly latencyP95Ms: number;
  readonly rateLimit: { remaining: number; limit: number; resetAt: string } | null;
  readonly status: "CERTIFIED" | "CONDITIONAL" | "FAILED";
  readonly level: "PRODUCTION" | "STAGING" | "DEVELOPMENT";
  readonly notes: string[];
}