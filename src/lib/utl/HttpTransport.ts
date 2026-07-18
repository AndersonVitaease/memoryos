/**
 * HttpTransport.ts — Universal Transport Layer v1.0
 * Sprint EF-6.5.0
 *
 * THE ONLY module in MemoryOS that may contain:
 *   fetch(), URL, headers, HTTP methods, body serialization
 *
 * All HTTP concerns extracted from UCRPipeline live here.
 * Runtime only calls: transport.execute(TransportRequest)
 */

import type { ITransport }         from "./ITransport";
import type {
  TransportRequest,
  TransportResponse,
  TransportCapabilities,
  TransportMetrics,
} from "./UTLTypes";

// ── HTTP meta type (opaque to Runtime, read only by HttpTransport) ────────────
// Placed in request.meta by adapter when HTTP-specific hints are needed.

interface HttpMeta {
  method?:          "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  contentType?:     string;
  additionalHeaders?: Record<string, string>;
}

// ── Status code → normalized error code ──────────────────────────────────────

function normalizeStatusCode(status: number, body: string): number {
  if (body === "TIMEOUT" || body.includes("AbortError")) return 0;
  return status;
}

function isRetryable(status: number, body: string): boolean {
  if (body === "TIMEOUT") return true;
  return [429, 500, 502, 503, 504].includes(status);
}

// ── Metrics accumulator ───────────────────────────────────────────────────────

interface HttpMetricsAcc {
  total:   number;
  success: number;
  failure: number;
  totalMs: number;
  lastAt:  string | null;
}

// ── HttpTransport ─────────────────────────────────────────────────────────────

export class HttpTransport implements ITransport {
  readonly id       = "http";
  readonly name     = "HTTP Transport";
  readonly protocol = "HTTP/1.1";

  private readonly _metrics: HttpMetricsAcc = { total: 0, success: 0, failure: 0, totalMs: 0, lastAt: null };
  private readonly _inflight = new Map<string, AbortController>();

  async initialize(): Promise<void> {
    // HTTP is stateless — no initialization needed
  }

  async shutdown(): Promise<void> {
    // Cancel all in-flight requests
    for (const [, ctrl] of this._inflight) ctrl.abort();
    this._inflight.clear();
  }

  async health(): Promise<boolean> {
    // HTTP transport is always available (browser fetch API)
    return typeof fetch !== "undefined";
  }

  cancel(traceId: string): void {
    const ctrl = this._inflight.get(traceId);
    if (ctrl) { ctrl.abort(); this._inflight.delete(traceId); }
  }

  capabilities(): TransportCapabilities {
    return Object.freeze({
      supportsStreaming:      false,  // fetch streaming possible but not wired here
      supportsSessions:       false,
      supportsBinary:         true,
      supportsCompression:    true,
      supportsAuthentication: true,
      supportsBidirectional:  false,
      supportsTransactions:   false,
      supportsReconnect:      true,
      supportsCancellation:   true,
      supportsRetry:          true,
    });
  }

  supports(request: TransportRequest): boolean {
    // Supports any request whose endpoint looks like an HTTP(S) URL
    return request.endpoint.startsWith("http://") || request.endpoint.startsWith("https://");
  }

  metrics(): TransportMetrics {
    return Object.freeze({
      transportId:   this.id,
      protocol:      this.protocol,
      totalRequests: this._metrics.total,
      successCount:  this._metrics.success,
      failureCount:  this._metrics.failure,
      avgDurationMs: this._metrics.total > 0 ? Math.round(this._metrics.totalMs / this._metrics.total) : 0,
      lastUsedAt:    this._metrics.lastAt,
    });
  }

  // ── Core execute ────────────────────────────────────────────────────────────

  async execute(request: TransportRequest): Promise<TransportResponse> {
    const t0         = Date.now();
    const traceId    = request.traceId ?? `http-${Date.now()}`;
    const timeoutMs  = request.timeoutMs ?? 15000;
    const meta       = (request.meta ?? {}) as HttpMeta;

    // Build HTTP request from TransportRequest
    const method  = meta.method ?? "GET";
    const url     = request.endpoint;
    const headers: Record<string, string> = {
      ...(meta.additionalHeaders ?? {}),
    };

    // Auth credential injected as Bearer token (HTTP convention lives here, not in Runtime)
    if (request.credential) {
      headers["Authorization"] = `Bearer ${request.credential}`;
    }

    // Body serialization (HTTP concern — only HttpTransport serializes)
    let body: string | undefined;
    if (request.payload && method !== "GET" && method !== "DELETE") {
      body = JSON.stringify(request.payload);
      headers["Content-Type"] = meta.contentType ?? "application/json";
    }

    // AbortController for timeout + cancellation
    const controller = new AbortController();
    this._inflight.set(traceId, controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const started = new Date().toISOString();

    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(timer);
      this._inflight.delete(traceId);

      const rawBody = await res.text();
      const dur     = Date.now() - t0;

      // Best-effort JSON parse (HTTP concern: JSON is an HTTP response format)
      let parsed: unknown = rawBody;
      try { parsed = JSON.parse(rawBody); } catch { /* keep as string */ }

      this._record(res.ok, dur);

      return this._response(res.ok, res.status, rawBody, parsed, dur, traceId, started, 0);

    } catch (e) {
      clearTimeout(timer);
      this._inflight.delete(traceId);
      const isTimeout = (e as Error).name === "AbortError";
      const dur = Date.now() - t0;
      this._record(false, dur);
      return this._response(false, 0, isTimeout ? "TIMEOUT" : String(e), null, dur, traceId, started, 0);
    }
  }

  // ── Execute with retry (called by UCRPipeline) ─────────────────────────────

  async executeWithRetry(
    request: TransportRequest,
    maxRetries: number,
    baseDelayMs: number,
  ): Promise<TransportResponse & { retries: number }> {
    let retries = 0;
    let last!: TransportResponse;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        retries++;
        await delay(baseDelayMs * Math.pow(2, attempt - 1));
      }
      last = await this.execute(request);
      if (last.ok) break;
      if (!isRetryable(last.statusCode, last.body)) break;
    }

    return { ...last, retries };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _response(
    ok: boolean,
    statusCode: number,
    body: string,
    data: unknown,
    durationMs: number,
    traceId: string,
    timestamp: string,
    retries: number,
  ): TransportResponse {
    return Object.freeze({
      ok,
      statusCode: normalizeStatusCode(statusCode, body),
      body,
      data,
      durationMs,
      traceId,
      metadata: Object.freeze({ transportId: this.id, protocol: this.protocol, retries, timestamp }),
    });
  }

  private _record(ok: boolean, durationMs: number): void {
    this._metrics.total++;
    if (ok) this._metrics.success++; else this._metrics.failure++;
    this._metrics.totalMs += durationMs;
    this._metrics.lastAt   = new Date().toISOString();
  }
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Singleton ─────────────────────────────────────────────────────────────────

export const httpTransport = new HttpTransport();