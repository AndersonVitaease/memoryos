/**
 * UCRPipeline.ts — Universal Connector Runtime v1.0
 * Sprint EF-6.4.0
 *
 * The single pipeline executed on every connector request:
 *
 *   Authentication Middleware
 *   → Rate Limiter
 *   → Retry Policy
 *   → HTTP Executor
 *   → Response Validator
 *   → Audit Logger
 *   → Metrics Collector
 *
 * All connectors share this exact pipeline.
 * Adapters only supply: URL + headers + body + parseResponse().
 */

import type { UCRRequest, UCRResponse, UCRAudit, UCRConfig, UCRErrorCode } from "./UCRTypes";
import { DEFAULT_UCR_CONFIG } from "./UCRTypes";
import { UCRMetricsStore }    from "./UCRMetricsStore";
import { UCRCircuitBreaker }  from "./UCRCircuitBreaker";
import { UCRRateLimiter }     from "./UCRRateLimiter";

// ── Trace ID generator ────────────────────────────────────────────────────────

let _seq = 1;
function traceId(connectorId: string): string {
  return `${connectorId}-${Date.now()}-${(_seq++).toString().padStart(4, "0")}`;
}

// ── HTTP status → error code ──────────────────────────────────────────────────

function statusToCode(status: number, body: string): UCRErrorCode {
  if (body.includes("TIMEOUT") || body.includes("AbortError")) return "TIMEOUT";
  if (status === 0)   return "API_UNAVAILABLE";
  if (status === 401) return "NOT_AUTHENTICATED";
  if (status === 403) {
    if (body.includes("quotaExceeded") || body.includes("userRateLimitExceeded")) return "QUOTA_EXCEEDED";
    return "NO_PERMISSION";
  }
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  return "UNKNOWN";
}

// ── Retry-able status codes ───────────────────────────────────────────────────

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// ── Core HTTP fetch (single attempt) ─────────────────────────────────────────

async function httpFetch(req: UCRRequest, timeoutMs: number): Promise<{ ok: boolean; status: number; rawText: string; durationMs: number }> {
  const t0         = Date.now();
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(req.url, {
      method:  req.method ?? "GET",
      headers: req.headers ?? {},
      body:    req.body ? JSON.stringify(req.body) : undefined,
      signal:  controller.signal,
    });
    clearTimeout(timer);
    const rawText = await res.text();
    return { ok: res.ok, status: res.status, rawText, durationMs: Date.now() - t0 };
  } catch (e) {
    clearTimeout(timer);
    const isTimeout = (e as Error).name === "AbortError";
    return { ok: false, status: 0, rawText: isTimeout ? "TIMEOUT" : String(e), durationMs: Date.now() - t0 };
  }
}

// ── Delay helper ──────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ── Main pipeline executor ────────────────────────────────────────────────────

export async function executePipeline(
  connectorId: string,
  req: UCRRequest,
  config: Readonly<UCRConfig> = DEFAULT_UCR_CONFIG,
): Promise<UCRResponse> {
  const tid       = req.traceId ?? traceId(connectorId);
  const startedAt = new Date().toISOString();
  const t0        = Date.now();
  let retries     = 0;

  // ── Stage 1: Circuit Breaker check ────────────────────────────────────────
  const cb = UCRCircuitBreaker.get(connectorId);
  if (cb.isOpen()) {
    const dur = Date.now() - t0;
    UCRMetricsStore.record(connectorId, false, dur, 0, "CIRCUIT_OPEN");
    return {
      ok:         false,
      status:     0,
      data:       null,
      rawText:    "CIRCUIT_OPEN",
      durationMs: dur,
      traceId:    tid,
      audit:      buildAudit(connectorId, req.operation, tid, startedAt, dur, 0, "failure", "CIRCUIT_OPEN"),
    };
  }

  // ── Stage 2: Rate Limiter check ────────────────────────────────────────────
  const rl = UCRRateLimiter.get(connectorId);
  if (!rl.tryConsume(config.rateLimitMax, config.rateLimitWindowMs)) {
    const dur = Date.now() - t0;
    UCRMetricsStore.record(connectorId, false, dur, 0, "RATE_LIMITED");
    return {
      ok:         false,
      status:     429,
      data:       null,
      rawText:    "RATE_LIMITED",
      durationMs: dur,
      traceId:    tid,
      audit:      buildAudit(connectorId, req.operation, tid, startedAt, dur, 0, "failure", "RATE_LIMITED"),
    };
  }

  // ── Stage 3: Retry loop (with exponential backoff) ────────────────────────
  const timeoutMs = req.timeoutMs ?? config.defaultTimeoutMs;
  let lastResult: { ok: boolean; status: number; rawText: string; durationMs: number } | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      retries++;
      await delay(config.retryBaseDelayMs * Math.pow(2, attempt - 1));
    }

    lastResult = await httpFetch(req, timeoutMs);

    if (lastResult.ok) break;
    if (!RETRYABLE.has(lastResult.status) && lastResult.rawText !== "TIMEOUT") break;
  }

  const res      = lastResult!;
  const dur      = Date.now() - t0;
  const errCode  = res.ok ? null : statusToCode(res.status, res.rawText);

  // ── Stage 4: Circuit Breaker feedback ─────────────────────────────────────
  cb.record(res.ok);

  // ── Stage 5: Parse JSON (best-effort) ─────────────────────────────────────
  let parsed: unknown = null;
  if (res.ok) {
    try { parsed = JSON.parse(res.rawText); } catch { parsed = res.rawText; }
  }

  // ── Stage 6: Audit + Metrics ──────────────────────────────────────────────
  const audit = buildAudit(connectorId, req.operation, tid, startedAt, dur, retries, res.ok ? "success" : "failure", errCode);
  UCRMetricsStore.record(connectorId, res.ok, dur, retries, errCode);

  return { ok: res.ok, status: res.status, data: parsed, rawText: res.rawText, durationMs: dur, traceId: tid, audit };
}

// ── Audit builder ─────────────────────────────────────────────────────────────

function buildAudit(
  connectorId: string,
  operation: string,
  traceId: string,
  startedAt: string,
  durationMs: number,
  retries: number,
  result: "success" | "failure",
  errorCode: string | null,
): UCRAudit {
  return Object.freeze({ connectorId, operation, traceId, startedAt, durationMs, result, retries, errorCode });
}