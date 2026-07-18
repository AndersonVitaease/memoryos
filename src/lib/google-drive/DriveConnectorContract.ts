/**
 * DriveConnectorContract.ts — Sprint EF-6.3.2
 *
 * Standardized public contract for the Google Drive Connector.
 * This contract is the reference template for future connectors:
 *   Gmail · Dropbox · OneDrive · SharePoint · GitHub · WhatsApp
 *
 * Rules:
 *   - ConnectorRequest  → what the executor sends to the connector
 *   - ConnectorResponse → what the connector returns (always typed)
 *   - ConnectorError    → uniform error envelope
 *   - ConnectorAudit    → immutable audit trail record
 *
 * No connector implementation detail leaks through this interface.
 * Executors depend ONLY on this contract.
 */

// ── ConnectorRequest ──────────────────────────────────────────────────────────

export interface ConnectorRequest {
  /** Capability being invoked */
  readonly capability: string;
  /** Goal parameters forwarded from the planner */
  readonly parameters: Record<string, unknown>;
  /** Optional caller trace ID for audit correlation */
  readonly traceId?: string;
}

// ── ConnectorResponse ─────────────────────────────────────────────────────────

export interface ConnectorResponse<T = unknown> {
  readonly ok:        boolean;
  readonly data:      T | null;
  readonly error:     ConnectorError | null;
  readonly audit:     ConnectorAudit;
}

// ── ConnectorError ────────────────────────────────────────────────────────────

export type ConnectorErrorCode =
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "NO_PERMISSION"
  | "API_UNAVAILABLE"
  | "TIMEOUT"
  | "QUOTA_EXCEEDED"
  | "NOT_AUTHENTICATED"
  | "INVALID_PARAMS"
  | "UNKNOWN";

export interface ConnectorError {
  readonly code:    ConnectorErrorCode;
  readonly message: string;
  readonly detail?: string;
}

// ── ConnectorAudit ────────────────────────────────────────────────────────────

export interface ConnectorAudit {
  readonly connectorId: string;
  readonly capability:  string;
  readonly traceId:     string;
  readonly startedAt:   string;
  readonly durationMs:  number;
  readonly result:      "success" | "failure";
  readonly errorCode:   string | null;
}

// ── IConnectorFacade ──────────────────────────────────────────────────────────
// Every connector that follows this contract must implement this interface.
// Executors call execute() — they never call fetch(), never see tokens.

export interface IConnectorFacade {
  readonly connectorId: string;
  execute<T = unknown>(request: ConnectorRequest): Promise<ConnectorResponse<T>>;
}

// ── Helper: build audit record ────────────────────────────────────────────────

let _seq = 1;
export function buildAuditRecord(
  connectorId: string,
  capability: string,
  startedAt: string,
  durationMs: number,
  result: "success" | "failure",
  errorCode: string | null,
  traceId?: string,
): ConnectorAudit {
  return Object.freeze({
    connectorId,
    capability,
    traceId: traceId ?? `trace-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`,
    startedAt,
    durationMs,
    result,
    errorCode,
  });
}

// ── Helper: map HTTP status → ConnectorErrorCode ──────────────────────────────

export function httpStatusToErrorCode(status: number, body?: string): ConnectorErrorCode {
  if (body === "TIMEOUT" || (body ?? "").includes("TIMEOUT")) return "TIMEOUT";
  if (status === 401) return "NOT_AUTHENTICATED";
  if (status === 403) {
    if ((body ?? "").includes("quotaExceeded") || (body ?? "").includes("userRateLimitExceeded")) return "QUOTA_EXCEEDED";
    return "NO_PERMISSION";
  }
  if (status === 404) return "NOT_FOUND";
  if (status === 0)   return "API_UNAVAILABLE";
  return "UNKNOWN";
}