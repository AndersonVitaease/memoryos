/**
 * UCRTypes.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * Canonical contracts used by every connector adapter.
 * No adapter implements infrastructure — only these types.
 */

// ── ConnectorRequest ──────────────────────────────────────────────────────────

export interface UCRRequest {
  /** Adapter-defined operation name (e.g. "drive.files.list") */
  readonly operation:   string;
  /** URL to call */
  readonly url:         string;
  /** HTTP method */
  readonly method?:     "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Extra headers (auth added by Runtime) */
  readonly headers?:    Record<string, string>;
  /** JSON body (for POST/PUT) */
  readonly body?:       unknown;
  /** Timeout override in ms (default: Runtime default) */
  readonly timeoutMs?:  number;
  /** Caller trace ID */
  readonly traceId?:    string;
}

// ── ConnectorResponse ─────────────────────────────────────────────────────────

export interface UCRResponse<T = unknown> {
  readonly ok:         boolean;
  readonly status:     number;
  readonly data:       T | null;
  readonly rawText:    string;
  readonly durationMs: number;
  readonly traceId:    string;
  readonly audit:      UCRAudit;
}

// ── ConnectorError ────────────────────────────────────────────────────────────

export type UCRErrorCode =
  | "NOT_AUTHENTICATED"
  | "TOKEN_EXPIRED"
  | "NO_PERMISSION"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CIRCUIT_OPEN"
  | "API_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

export interface UCRError {
  readonly code:    UCRErrorCode;
  readonly message: string;
  readonly status:  number;
  readonly detail?: string;
}

// ── ConnectorAudit ────────────────────────────────────────────────────────────

export interface UCRAudit {
  readonly connectorId: string;
  readonly operation:   string;
  readonly traceId:     string;
  readonly startedAt:   string;
  readonly durationMs:  number;
  readonly result:      "success" | "failure";
  readonly retries:     number;
  readonly errorCode:   string | null;
}

// ── ConnectorMetrics ──────────────────────────────────────────────────────────

export interface UCRMetrics {
  readonly connectorId:      string;
  readonly totalRequests:    number;
  readonly successCount:     number;
  readonly failureCount:     number;
  readonly timeoutCount:     number;
  readonly retryCount:       number;
  readonly avgDurationMs:    number;
  readonly circuitState:     "closed" | "open" | "half-open";
  readonly lastRequestAt:    string | null;
}

// ── Lifecycle states ──────────────────────────────────────────────────────────

export type ConnectorLifecycleState =
  | "uninitialized"
  | "initializing"
  | "authenticating"
  | "ready"
  | "executing"
  | "degraded"
  | "shutdown";

// ── ConnectorAdapter interface ────────────────────────────────────────────────
// Each adapter implements ONLY this — no infrastructure.

export interface ConnectorAdapter {
  /** Unique connector identifier */
  readonly id:          string;
  /** Human-readable name */
  readonly name:        string;
  /** Capabilities this adapter provides */
  readonly capabilities: readonly string[];

  /**
   * Build a UCRRequest for the given operation and parameters.
   * Called by the Runtime before executing the pipeline.
   * Adapter knows endpoints + payloads. Runtime handles everything else.
   */
  buildRequest(operation: string, params: Record<string, unknown>, token: string): UCRRequest;

  /**
   * Parse the raw response into a typed domain object.
   * Called by the Runtime after executing the pipeline.
   */
  parseResponse<T = unknown>(operation: string, response: UCRResponse): T;
}

// ── RuntimeConfig ─────────────────────────────────────────────────────────────

export interface UCRConfig {
  /** Default request timeout in ms */
  readonly defaultTimeoutMs:      number;
  /** Max retry attempts */
  readonly maxRetries:            number;
  /** Base delay for exponential backoff in ms */
  readonly retryBaseDelayMs:      number;
  /** Rate limit: max requests per window */
  readonly rateLimitMax:          number;
  /** Rate limit window in ms */
  readonly rateLimitWindowMs:     number;
  /** Circuit breaker: failure threshold to open */
  readonly circuitBreakerThreshold: number;
  /** Circuit breaker: reset timeout in ms */
  readonly circuitBreakerResetMs:   number;
}

export const DEFAULT_UCR_CONFIG: Readonly<UCRConfig> = Object.freeze({
  defaultTimeoutMs:        15000,
  maxRetries:              2,
  retryBaseDelayMs:        300,
  rateLimitMax:            60,
  rateLimitWindowMs:       60000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs:   30000,
});