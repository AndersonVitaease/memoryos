/**
 * IProductionConnector.ts — Production Connector Interface
 * Beta-01.1 · MemoryOS Production Connector Specification v1.0
 * 2026-07-13
 *
 * Every production-grade MemoryOS connector MUST implement this interface.
 * Provider-agnostic — no references to specific services.
 */

import type {
  ConnectorCapability, ConnectorCertification, ConnectorHealth,
  ConnectorMetrics, ConnectorPermissions, ConnectorDiagnostics,
  ConnectorValidation, ConnectorAvailability, ConnectorLatency,
} from "./PCSTypes";

// ── Authentication result ──────────────────────────────────────────────────────

export interface AuthResult {
  readonly success: boolean;
  readonly principal: string | null;
  readonly error?: string;
  readonly expiresAt?: number | null;
}

export interface AuthenticationDiagnostics {
  readonly configured: boolean;
  readonly authenticated: boolean;
  readonly principal: string | null;
  readonly tokenType: string | null;
  readonly expiryDetected: boolean;
  readonly scopesDeclared: string[];
  readonly issues: string[];
}

// ── IProductionConnector ───────────────────────────────────────────────────────

export interface IProductionConnector {

  /** Stable connector identifier (e.g. "github", "gmail", "slack"). */
  readonly id: string;

  /** Connector display name for UIs and logs. */
  readonly name: string;

  /** Semver version string (e.g. "2.0.0"). */
  readonly version: string;

  // ── Authentication ───────────────────────────────────────────────────────

  /** Establish authenticated session. */
  connect(): Promise<AuthResult>;

  /** Terminate authenticated session and clear credentials. */
  disconnect(): Promise<void>;

  /** Returns true when credentials are present and validated. */
  isAuthenticated(): Promise<boolean>;

  /** Refresh or re-validate credentials (e.g. token rotation). */
  refreshAuthentication(): Promise<AuthResult>;

  /** Structured permissions report: scopes, principal, missing requirements. */
  permissions(): Promise<ConnectorPermissions>;

  /** Detailed authentication diagnostics for support and debugging. */
  authenticationDiagnostics(): Promise<AuthenticationDiagnostics>;

  // ── Health ───────────────────────────────────────────────────────────────

  /** Lightweight health check — fast, cached-friendly. */
  health(): Promise<ConnectorHealth>;

  /** Comprehensive health check with all sub-checks. */
  fullHealth(): Promise<ConnectorHealth>;

  /** Availability report: uptime, last check, status. */
  availability(): Promise<ConnectorAvailability>;

  /** Latency statistics: avg, p95, min, max. */
  latency(): Promise<ConnectorLatency>;

  // ── Metrics ──────────────────────────────────────────────────────────────

  /** Returns current production metrics snapshot. */
  metrics(): ConnectorMetrics;

  /** Resets all counters and latency samples. */
  resetMetrics(): void;

  // ── Logging ──────────────────────────────────────────────────────────────

  /** Records a single execution log entry (called internally by execute()). */
  logExecution(operationId: string, durationMs: number, success: boolean, detail?: string): void;

  /** Returns last N execution log entries. */
  executionHistory(limit?: number): ExecutionLogEntry[];

  // ── Diagnostics ──────────────────────────────────────────────────────────

  /** Full diagnostics report for auth, health, metrics, capabilities, errors. */
  diagnostics(): Promise<ConnectorDiagnostics>;

  // ── Policy ───────────────────────────────────────────────────────────────

  /** Declares every capability this connector exposes. */
  supportedCapabilities(): ConnectorCapability[];

  /** Checks whether the connector is authorized to execute a given operation. */
  authorization(operation: string, context?: Record<string, unknown>): Promise<AuthorizationResult>;

  // ── Validation ────────────────────────────────────────────────────────────

  /** Lightweight sync pre-flight check (schema, config). */
  validate(): boolean;

  /** Full async production validation: auth, API, permissions, capabilities. */
  validateProduction(): Promise<ConnectorValidation>;

  // ── Certification ─────────────────────────────────────────────────────────

  /** Returns the current certification status of this connector. */
  certificationStatus(): ConnectorCertification;
}

// ── Supporting types ───────────────────────────────────────────────────────────

export interface ExecutionLogEntry {
  readonly id: string;
  readonly operationId: string;
  readonly timestamp: number;
  readonly durationMs: number;
  readonly success: boolean;
  readonly detail: string;
}

export interface AuthorizationResult {
  readonly authorized: boolean;
  readonly reason: string;
  readonly policyEvaluated: boolean;
}