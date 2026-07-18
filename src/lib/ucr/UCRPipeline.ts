/**
 * UCRPipeline.ts — Universal Connector Runtime v1.0 (migrated EF-6.5.0)
 *
 * Pipeline executed on every connector request.
 * After EF-6.5.0: Runtime knows ZERO about HTTP, fetch, URL, headers, body.
 * All transport is delegated to the Universal Transport Layer (UTL).
 *
 * Pipeline stages:
 *   [1] Circuit Breaker check
 *   [2] Rate Limiter check
 *   [3] Transport execution (via UTL — retry inside HttpTransport.executeWithRetry)
 *   [4] Circuit Breaker feedback
 *   [5] Audit + Metrics
 */

import type { UCRRequest, UCRResponse, UCRAudit, UCRConfig, UCRErrorCode } from "./UCRTypes";
import { DEFAULT_UCR_CONFIG } from "./UCRTypes";
import { UCRMetricsStore }    from "./UCRMetricsStore";
import { UCRCircuitBreaker }  from "./UCRCircuitBreaker";
import { UCRRateLimiter }     from "./UCRRateLimiter";

// UTL imports — Runtime ONLY uses the abstract interface
import "@/lib/utl/index";
import { TransportFactory }  from "@/lib/utl/TransportFactory";
import type { TransportRequest } from "@/lib/utl/UTLTypes";

// ── Trace ID generator ────────────────────────────────────────────────────────

let _seq = 1;
function makeTraceId(connectorId: string): string {
  return `${connectorId}-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`;
}

// ── Normalize transport status → UCR error code ───────────────────────────────
// This mapping stays in UCR (it owns error semantics), not in Transport.

function statusToCode(statusCode: number, body: string): UCRErrorCode {
  if (body === "TIMEOUT" || body.includes("AbortError")) return "TIMEOUT";
  if (body === "CIRCUIT_OPEN")                           return "CIRCUIT_OPEN";
  if (body === "RATE_LIMITED")                           return "RATE_LIMITED";
  if (body === "UNSUPPORTED_OPERATION")                  return "UNSUPPORTED_OPERATION" as UCRErrorCode;
  if (statusCode === 0)   return "API_UNAVAILABLE";
  if (statusCode === 401) return "NOT_AUTHENTICATED";
  if (statusCode === 403) {
    if (body.includes("quotaExceeded") || body.includes("userRateLimitExceeded")) return "QUOTA_EXCEEDED";
    return "NO_PERMISSION";
  }
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 429) return "RATE_LIMITED";
  return "UNKNOWN";
}

// ── UCR Request → Transport Request ───────────────────────────────────────────
// This bridge lives in UCR. Adapter builds UCRRequest; UCR translates to TransportRequest.
// Transport gets only: endpoint (from url), payload, credential, timeoutMs, meta.

function toTransportRequest(req: UCRRequest, traceId: string): TransportRequest {
  return {
    operation:   req.operation,
    endpoint:    req.url,           // "url" lives in UCRRequest (set by Adapter)
    payload:     req.body as Record<string, unknown> | undefined,
    credential:  req.credential,
    timeoutMs:   req.timeoutMs,
    traceId,
    meta: {
      ...(req.meta ?? {}),
      method:            req.method ?? "GET",
      additionalHeaders: req.headers,
    },
  };
}

// ── Main pipeline executor ────────────────────────────────────────────────────

export async function executePipeline(
  connectorId: string,
  req: UCRRequest,
  config: Readonly<UCRConfig> = DEFAULT_UCR_CONFIG,
): Promise<UCRResponse> {
  const tid       = req.traceId ?? makeTraceId(connectorId);
  const startedAt = new Date().toISOString();
  const t0        = Date.now();

  // ── Stage 1: Circuit Breaker ───────────────────────────────────────────────
  const cb = UCRCircuitBreaker.get(connectorId);
  if (cb.isOpen()) {
    const dur = Date.now() - t0;
    UCRMetricsStore.record(connectorId, false, dur, 0, "CIRCUIT_OPEN");
    return _shortCircuit(connectorId, req.operation, tid, startedAt, dur, "CIRCUIT_OPEN", 0);
  }

  // ── Stage 2: Rate Limiter ──────────────────────────────────────────────────
  const rl = UCRRateLimiter.get(connectorId);
  if (!rl.tryConsume(config.rateLimitMax, config.rateLimitWindowMs)) {
    const dur = Date.now() - t0;
    UCRMetricsStore.record(connectorId, false, dur, 0, "RATE_LIMITED");
    return _shortCircuit(connectorId, req.operation, tid, startedAt, dur, "RATE_LIMITED", 429);
  }

  // ── Stage 3: Transport execution (via UTL) ─────────────────────────────────
  // Runtime calls TransportFactory.resolve() → gets ITransport → calls execute/executeWithRetry.
  // No fetch(), URL, headers, body, HTTP method knowledge here.

  const transportReq = toTransportRequest(req, tid);
  const transport    = TransportFactory.resolve(transportReq);

  // Retry logic delegated to HttpTransport.executeWithRetry (HTTP concern)
  // For other transports, fall back to single execute (they handle retry internally if supported)
  let retries = 0;
  let transportRes;

  if ("executeWithRetry" in transport && typeof (transport as any).executeWithRetry === "function") {
    transportRes = await (transport as any).executeWithRetry(
      transportReq,
      config.maxRetries,
      config.retryBaseDelayMs,
    ) as { ok: boolean; statusCode: number; body: string; data: unknown; durationMs: number; retries: number };
    retries = transportRes.retries;
  } else {
    transportRes = await transport.execute(transportReq);
  }

  const dur     = Date.now() - t0;
  const errCode = transportRes.ok ? null : statusToCode(transportRes.statusCode, transportRes.body);

  // ── Stage 4: Circuit Breaker feedback ─────────────────────────────────────
  cb.record(transportRes.ok);

  // ── Stage 5: Audit + Metrics ──────────────────────────────────────────────
  const audit = _buildAudit(connectorId, req.operation, tid, startedAt, dur, retries, transportRes.ok ? "success" : "failure", errCode);
  UCRMetricsStore.record(connectorId, transportRes.ok, dur, retries, errCode);

  return {
    ok:         transportRes.ok,
    status:     transportRes.statusCode,
    data:       transportRes.data,
    rawText:    transportRes.body,
    durationMs: dur,
    traceId:    tid,
    audit,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _shortCircuit(
  connectorId: string, operation: string, traceId: string,
  startedAt: string, dur: number, reason: string, status: number,
): UCRResponse {
  return {
    ok:         false,
    status,
    data:       null,
    rawText:    reason,
    durationMs: dur,
    traceId,
    audit:      _buildAudit(connectorId, operation, traceId, startedAt, dur, 0, "failure", reason),
  };
}

function _buildAudit(
  connectorId: string, operation: string, traceId: string,
  startedAt: string, durationMs: number, retries: number,
  result: "success" | "failure", errorCode: string | null,
): UCRAudit {
  return Object.freeze({ connectorId, operation, traceId, startedAt, durationMs, result, retries, errorCode });
}