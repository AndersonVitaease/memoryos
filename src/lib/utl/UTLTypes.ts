/**
 * UTLTypes.ts — Universal Transport Layer v1.0
 * Sprint EF-6.5.0
 *
 * Canonical contracts for ALL transport mechanisms.
 * The Runtime, Adapters, and Connectors ONLY know these types.
 * No transport knows about: HTTP, WebSocket, gRPC, MCP, Filesystem, etc.
 */

// ── TransportRequest ──────────────────────────────────────────────────────────
// Universal descriptor of what the caller wants to do.
// No protocol-specific fields: no URL, no headers, no HTTP method.

export interface TransportRequest {
  /** Logical operation name (e.g. "drive.files.list") */
  readonly operation:   string;
  /** Logical endpoint identifier (resolved by Transport, e.g. a path, topic, channel) */
  readonly endpoint:    string;
  /** Input payload (structured data; Transport serializes as needed) */
  readonly payload?:    Record<string, unknown>;
  /** Auth credential (token, API key, etc. — opaque to Runtime) */
  readonly credential?: string;
  /** Optional timeout override in ms */
  readonly timeoutMs?:  number;
  /** Caller trace ID */
  readonly traceId?:    string;
  /** Transport-specific metadata (e.g. HTTP method, WS frame type) — opaque to Runtime */
  readonly meta?:       TransportMeta;
}

// ── TransportMeta — opaque bag for transport-specific hints ───────────────────
// The Runtime never reads these fields.
// Only the specific Transport implementation reads its own meta.

export type TransportMeta = Record<string, unknown>;

// ── TransportResponse ─────────────────────────────────────────────────────────

export interface TransportResponse {
  readonly ok:           boolean;
  /** Normalized status code (HTTP-like for HTTP, 0=error, 200=ok universally) */
  readonly statusCode:   number;
  /** Raw response body as string */
  readonly body:         string;
  /** Parsed response data (if parseable) */
  readonly data:         unknown;
  readonly durationMs:   number;
  readonly traceId:      string;
  readonly metadata:     TransportResponseMetadata;
}

export interface TransportResponseMetadata {
  readonly transportId:  string;
  readonly protocol:     string;
  readonly retries:      number;
  readonly timestamp:    string;
}

// ── TransportError ────────────────────────────────────────────────────────────

export type TransportErrorCode =
  | "NOT_AUTHENTICATED"
  | "NO_PERMISSION"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CIRCUIT_OPEN"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "TRANSPORT_NOT_FOUND"
  | "UNSUPPORTED_OPERATION"
  | "UNKNOWN";

export interface TransportError {
  readonly code:       TransportErrorCode;
  readonly message:    string;
  readonly statusCode: number;
  readonly detail?:    string;
}

// ── TransportCapabilities ─────────────────────────────────────────────────────
// Each Transport declares what it supports.
// The Factory uses these to select the right Transport.

export interface TransportCapabilities {
  readonly supportsStreaming:       boolean;
  readonly supportsSessions:        boolean;
  readonly supportsBinary:          boolean;
  readonly supportsCompression:     boolean;
  readonly supportsAuthentication:  boolean;
  readonly supportsBidirectional:   boolean;
  readonly supportsTransactions:    boolean;
  readonly supportsReconnect:       boolean;
  readonly supportsCancellation:    boolean;
  readonly supportsRetry:           boolean;
}

// ── TransportMetrics ──────────────────────────────────────────────────────────

export interface TransportMetrics {
  readonly transportId:   string;
  readonly protocol:      string;
  readonly totalRequests: number;
  readonly successCount:  number;
  readonly failureCount:  number;
  readonly avgDurationMs: number;
  readonly lastUsedAt:    string | null;
}

// ── TransportContext ──────────────────────────────────────────────────────────
// Execution context passed through the pipeline.

export interface TransportContext {
  readonly traceId:     string;
  readonly connectorId: string;
  readonly operation:   string;
  readonly startedAt:   string;
  readonly timeoutMs:   number;
}

// ── TransportSession ─────────────────────────────────────────────────────────
// For stateful transports (WebSocket, gRPC streams).

export interface TransportSession {
  readonly sessionId: string;
  readonly protocol:  string;
  isAlive():  boolean;
  close():    Promise<void>;
}