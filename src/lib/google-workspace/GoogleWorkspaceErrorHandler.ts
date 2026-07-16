/**
 * GoogleWorkspaceErrorHandler.ts — Engineering Sprint 7.0
 * Normalizes HTTP/network errors from Google APIs into GWSError.
 * Provides retry guidance for all error codes.
 */

import type { GWSError, GWSErrorCode } from "./GoogleWorkspaceTypes";

// ── HTTP status → GWSErrorCode ────────────────────────────────────────────────

function classifyStatus(status: number): GWSErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500)  return "SERVER_ERROR";
  return "UNKNOWN";
}

// ── Retry policy ──────────────────────────────────────────────────────────────

const RETRY_CONFIG: Record<GWSErrorCode, { retryable: boolean; baseDelayMs: number }> = {
  UNAUTHORIZED:        { retryable: false, baseDelayMs: 0 },
  FORBIDDEN:           { retryable: false, baseDelayMs: 0 },
  NOT_FOUND:           { retryable: false, baseDelayMs: 0 },
  RATE_LIMITED:        { retryable: true,  baseDelayMs: 60_000 },
  SERVER_ERROR:        { retryable: true,  baseDelayMs: 2_000 },
  TIMEOUT:             { retryable: true,  baseDelayMs: 1_000 },
  TOKEN_EXPIRED:       { retryable: true,  baseDelayMs: 0 },
  INSUFFICIENT_SCOPES: { retryable: false, baseDelayMs: 0 },
  UNKNOWN:             { retryable: false, baseDelayMs: 0 },
};

// ── Error handler ─────────────────────────────────────────────────────────────

class ErrorHandlerClass {
  /**
   * Normalize a fetch Response into a GWSError.
   */
  async fromResponse(resp: Response): Promise<GWSError> {
    let body: unknown = null;
    try { body = await resp.json(); } catch { /* ignore */ }

    const code    = classifyStatus(resp.status);
    const cfg     = RETRY_CONFIG[code];
    const message = this._extractMessage(body) ?? `HTTP ${resp.status}`;

    // Check for Retry-After header (rate limit)
    const retryAfterHeader = resp.headers.get("Retry-After");
    const retryAfter = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : cfg.retryable ? cfg.baseDelayMs : null;

    return Object.freeze({ code, message, retryable: cfg.retryable, retryAfter, raw: body });
  }

  /**
   * Normalize a caught JS error (network failure, timeout) into a GWSError.
   */
  fromException(err: unknown): GWSError {
    const msg  = err instanceof Error ? err.message : String(err);
    const code: GWSErrorCode = msg.toLowerCase().includes("timeout") ? "TIMEOUT" : "UNKNOWN";
    const cfg  = RETRY_CONFIG[code];
    return Object.freeze({ code, message: msg, retryable: cfg.retryable, retryAfter: cfg.baseDelayMs || null, raw: err });
  }

  /**
   * Exponential backoff delay for retries.
   */
  backoffMs(attempt: number, baseMs = 1000, maxMs = 60_000): number {
    return Math.min(baseMs * Math.pow(2, attempt), maxMs);
  }

  /**
   * Execute a fetch with automatic retry on retryable errors.
   * Max 3 attempts.
   */
  async withRetry(
    fn: () => Promise<Response>,
    maxAttempts = 3,
  ): Promise<Response> {
    let lastErr: GWSError | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const resp = await fn();
        if (resp.ok) return resp;
        const gwsErr = await this.fromResponse(resp.clone());
        if (!gwsErr.retryable) throw gwsErr;
        lastErr = gwsErr;
        const delay = gwsErr.retryAfter ?? this.backoffMs(i);
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) {
        if ((e as GWSError).code) throw e;
        const gwsErr = this.fromException(e);
        if (!gwsErr.retryable) throw gwsErr;
        lastErr = gwsErr;
        await new Promise((r) => setTimeout(r, this.backoffMs(i)));
      }
    }
    throw lastErr ?? new Error("Max retries exceeded");
  }

  private _extractMessage(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    return (b?.error as Record<string, unknown>)?.message as string
      ?? b?.message as string
      ?? null;
  }
}

const _KEY = "__GWS_ERR_HANDLER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new ErrorHandlerClass();
}
export const GoogleWorkspaceErrorHandler: ErrorHandlerClass = (
  globalThis as unknown as Record<string, ErrorHandlerClass>
)[_KEY];