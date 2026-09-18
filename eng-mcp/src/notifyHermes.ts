// engineering.notify.hermes - one-way, best-effort mission notification to the
// Hermes Agent gateway. The endpoint and the Bearer are ALWAYS server-side
// configuration: a fixed loopback endpoint (the OpenAI-compatible API server of
// the Hermes gateway) plus a credential resolved only from the container env /
// LoadCredential chain (unit -> runner -> /run/secrets). Caller-supplied URLs,
// endpoints or credentials are structurally impossible - the input schema
// accepts ONLY {summary, status?}. Failures are honest and best-effort: the run
// function NEVER throws after schema validation, it returns delivered:false
// with a typed error code, so a gateway outage can never fail the engineering
// mission that triggered the notification.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import { EngineeringError, assertNoSensitiveContent } from "./policy.js";

export const notifyHermesInputSchema = z.object({
  summary: z.string().min(1).max(500),
  status: z.enum(["complete", "partial", "failed", "blocked"]).optional()
}).strict();

export type NotifyHermesInput = z.infer<typeof notifyHermesInputSchema>;

export type NotifyHermesResult = {
  delivered: boolean;
  status_code?: number;
  latency_ms?: number;
  hermes_run_id?: string;
  notified_at: string;
  error?: string;
  detail?: string;
};

// ENG_MCP_HERMES_API_BASE is a SERVER-LEVEL env override (container env; needed
// for deterministic tests because the production runner host has the real
// gateway occupying the default loopback endpoint) - never a tool input.
const HERMES_API_BASE_DEFAULT = "http://127.0.0.1:8642";
const HERMES_MODEL = "hermes-agent";
const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_MAX_ENTRIES = 100;
const COOLDOWN_DEFAULT_MS = 60_000;
const HOURLY_LIMIT_DEFAULT = 10;
const TIMEOUT_DEFAULT_MS = 30_000;
const DETAIL_MAX = 200;
const RUN_ID_MAX = 64;
const HOURLY_WINDOW_MS = 3_600_000;

// In-process rate/dedupe state. Single production container = single state;
// loss across restarts is acceptable (the gateway is the durable side).
const state = { dedupe: new Map<string, number>(), attemptTimestamps: [] as number[], lastAttemptAt: null as number | null };

export function __resetNotifyHermesStateForTests(): void {
  state.dedupe.clear();
  state.attemptTimestamps.length = 0;
  state.lastAttemptAt = null;
}

function failure(notifiedAt: string, error: string, detail?: string): NotifyHermesResult {
  return { delivered: false, notified_at: notifiedAt, error, ...(detail ? { detail } : {}) };
}

function redactDetail(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/[A-Fa-f0-9]{64}/g, "[REDACTED]")
    .slice(0, DETAIL_MAX);
}

// Credential resolution order: HERMES_API_KEY env wins (deterministic unit
// tests), else ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE (LoadCredential chain).
// No anonymous fallback - a missing credential is a typed failure.
function resolveHermesApiKey(): string | null {
  const fromEnv = process.env.HERMES_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const credentialFile = process.env.ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE;
  if (credentialFile) {
    try {
      const value = readFileSync(credentialFile, "utf8").trim();
      if (value) return value;
    } catch {
      return null;
    }
  }
  return null;
}

function dedupeKey(input: NotifyHermesInput): string {
  return createHash("sha256").update(`${input.status ?? "complete"}\n${input.summary}`).digest("hex");
}

// Cooldown (time since the last attempt) + hourly rolling budget, both surfaced
// as RATE_LIMITED_LOCAL. The budget is consumed on ATTEMPT (see runNotifyHermes)
// so a down gateway cannot be used to bypass it, and a rejected call never
// extends the cooldown window.
function rateLimitedNow(nowMs: number): boolean {
  const cooldownMs = Number(process.env.ENG_MCP_HERMES_COOLDOWN_MS ?? COOLDOWN_DEFAULT_MS);
  const hourlyLimit = Number(process.env.ENG_MCP_HERMES_HOURLY_LIMIT ?? HOURLY_LIMIT_DEFAULT);
  if (state.lastAttemptAt !== null && Number.isFinite(cooldownMs) && cooldownMs > 0 && nowMs - state.lastAttemptAt < cooldownMs) return true;
  state.attemptTimestamps = state.attemptTimestamps.filter((ts) => nowMs - ts < HOURLY_WINDOW_MS);
  return state.attemptTimestamps.length >= (Number.isFinite(hourlyLimit) && hourlyLimit > 0 ? hourlyLimit : HOURLY_LIMIT_DEFAULT);
}

export async function runNotifyHermes(input: NotifyHermesInput): Promise<NotifyHermesResult> {
  const notifiedAt = new Date().toISOString();
  const nowMs = Date.now();
  try {
    // 1. Sensitive-content gate: reject before any rate state is touched.
    try {
      assertNoSensitiveContent(input.summary);
    } catch (error) {
      return failure(notifiedAt, error instanceof EngineeringError ? error.code : "SENSITIVE_CONTENT_BLOCKED");
    }
    // 2. Dedupe: identical status+summary inside the TTL window is reported
    // honestly (DEDUPLICATED) and consumes no budget.
    const key = dedupeKey(input);
    const seenAt = state.dedupe.get(key);
    if (seenAt !== undefined && nowMs - seenAt < DEDUPE_TTL_MS) {
      return failure(notifiedAt, "DEDUPLICATED", "identical notification already delivered inside the dedupe window");
    }
    // 3+4. Cooldown and hourly rolling budget.
    if (rateLimitedNow(nowMs)) return failure(notifiedAt, "RATE_LIMITED_LOCAL");
    // 5. Credential (server-side only; never accepted from the caller).
    const apiKey = resolveHermesApiKey();
    if (!apiKey) return failure(notifiedAt, "HERMES_CREDENTIAL_MISSING", "configure HERMES_API_KEY or ENG_MCP_HERMES_NOTIFY_CREDENTIAL_FILE");
    // 6. Attempt point: the budget and the cooldown are consumed from here on,
    // regardless of the outcome (anti-saturation even when the gateway is down).
    state.attemptTimestamps.push(nowMs);
    state.lastAttemptAt = nowMs;
    const base = (process.env.ENG_MCP_HERMES_API_BASE ?? "").trim() || HERMES_API_BASE_DEFAULT;
    const status = input.status ?? "complete";
    const content = `[GH] Missão finalizada — status: ${status}\n${input.summary}\n(Notificação one-way do eng-mcp; não responda nesta conversa — ela não é monitorada.)`;
    const controller = new AbortController();
    const timeoutMs = Number(process.env.ENG_MCP_HERMES_TIMEOUT_MS ?? TIMEOUT_DEFAULT_MS);
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_DEFAULT_MS);
    let response: Response;
    try {
      response = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model: HERMES_MODEL, stream: false, messages: [{ role: "user", content }] }),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) return failure(notifiedAt, "HERMES_RUN_TIMEOUT", `gateway did not answer within ${Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_DEFAULT_MS}ms`);
      return failure(notifiedAt, "HERMES_UNAVAILABLE", redactDetail(error instanceof Error ? error.message : String(error)));
    } finally {
      clearTimeout(timer);
    }
    if (response.status !== 200) {
      let bodySnippet = "";
      try { bodySnippet = (await response.text()).slice(0, 120); } catch { /* body unreadable: keep the status line only */ }
      const code = response.status === 401 ? "HERMES_AUTH_REJECTED" : response.status === 400 ? "HERMES_BAD_REQUEST" : response.status === 429 ? "HERMES_BUSY" : "HERMES_UPSTREAM_ERROR";
      return failure(notifiedAt, code, bodySnippet ? redactDetail(bodySnippet) : `HTTP ${response.status}`);
    }
    // Success: confirm ONLY the HTTP 200 contract - deliver the gateway's run
    // id (bounded) when the payload carries one, never the raw payload.
    let payload: { id?: unknown } = {};
    try { payload = (await response.json()) as { id?: unknown }; } catch { /* deliver without run id */ }
    state.dedupe.set(key, nowMs);
    if (state.dedupe.size > DEDUPE_MAX_ENTRIES) {
      const oldest = state.dedupe.keys().next().value;
      if (oldest !== undefined) state.dedupe.delete(oldest);
    }
    const rawId = typeof payload.id === "string" ? payload.id : undefined;
    return {
      delivered: true,
      status_code: 200,
      latency_ms: Date.now() - nowMs,
      ...(rawId ? { hermes_run_id: rawId.slice(0, RUN_ID_MAX) } : {}),
      notified_at: notifiedAt
    };
  } catch (error) {
    // Best-effort last resort: NEVER throw after schema validation.
    return failure(notifiedAt, "HERMES_UNEXPECTED_ERROR", redactDetail(error instanceof Error ? error.message : String(error)));
  }
}
