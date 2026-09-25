// GWS-TOOLS-01: Google Workspace tool client — the single fetch path from the
// eng-mcp tools to the base44 function `googleWorkspaceApi` (which holds the
// GoogleOAuthToken refresh logic server-side; tokens NEVER cross this boundary).
//
// Strict schemas in the imageEdit style: every op has a .strict() zod schema,
// callers can never send raw params, and T2/T3 mutations only accept
// dryRun=true through the MCP surface (the caller's PLAN gate — operator
// approval in chat — is documented in docs/gws-runbook.md and enforced by the
// tier scopes below; this module never decides governance, it only carries it).
//
// Fail-closed: missing/unreadable credential file short-circuits before any
// network call; response size-capped; secret-shaped values redacted before
// leaving the module; audit is metadata-only (op/tier/status/durationMs).
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";

export const DEFAULT_GWS_ENDPOINT = "https://ever-mind-core.base44.app/functions/googleWorkspaceApi";
export const GWS_AUDIT_FILE = "/data/audit/gws.jsonl";
const MAX_RESPONSE_BYTES = 200 * 1024;
export const DEFAULT_GWS_TIMEOUT_MS = 30_000;
export const MAX_GWS_TIMEOUT_MS = 60_000;
const SENSITIVE_KEY_PATTERN = /authorization|token|secret|password|cookie|bearer/i;

export type GwsTier = "T1" | "T2" | "T3";

// ---- strict per-op schemas (param names mirror the backend runOp switch) ----
const accountParam = z.string().min(3).max(320).optional();
const dryRunParam = z.literal(true).optional();
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const GWS_SCHEMAS = {
  // T1 — read (autonomous)
  "gmail.list": z.object({ account: accountParam, query: z.string().max(500).optional(), labelIds: z.string().max(100).optional(), maxResults: z.number().int().min(1).max(25).optional() }).strict(),
  "gmail.get": z.object({ account: accountParam, messageId: z.string().min(1).max(200) }).strict(),
  "calendar.list": z.object({ account: accountParam, timeMin: z.string().min(10).max(64).optional(), timeMax: z.string().min(10).max(64).optional(), query: z.string().max(500).optional(), maxResults: z.number().int().min(1).max(50).optional() }).strict(),
  "drive.list": z.object({ account: accountParam, query: z.string().max(500).optional(), maxResults: z.number().int().min(1).max(50).optional() }).strict(),
  "contacts.list": z.object({ account: accountParam, maxResults: z.number().int().min(1).max(200).optional() }).strict(),
  // T2 — write (caller PLAN gate; dryRun = dummy test, never touches Google)
  "gmail.send": z.object({ account: accountParam, to: z.string().regex(emailPattern, "EMAIL_INVALID").max(320), subject: z.string().min(1).max(500), body: z.string().min(1).max(50_000), dryRun: dryRunParam }).strict(),
  "gmail.reply": z.object({ account: accountParam, threadId: z.string().min(1).max(200), body: z.string().min(1).max(50_000), dryRun: dryRunParam }).strict(),
  "calendar.createEvent": z.object({ account: accountParam, summary: z.string().min(1).max(500), start: z.string().min(10).max(64), end: z.string().min(10).max(64), description: z.string().max(2000).optional(), timeZone: z.string().max(64).optional(), dryRun: dryRunParam }).strict(),
  "drive.upload": z.object({ account: accountParam, name: z.string().min(1).max(200), mimeType: z.string().min(1).max(200), content: z.string().min(1).max(500_000), dryRun: dryRunParam }).strict(),
  "drive.update": z.object({ account: accountParam, fileId: z.string().min(1).max(200), mimeType: z.string().max(200).optional(), content: z.string().min(1).max(500_000), dryRun: dryRunParam }).strict(),
  "docs.create": z.object({ account: accountParam, title: z.string().min(1).max(200), dryRun: dryRunParam }).strict(),
  "docs.append": z.object({ account: accountParam, documentId: z.string().min(1).max(200), content: z.string().min(1).max(50_000), dryRun: dryRunParam }).strict(),
  // T3 — external/destructive (dedicated manage scope ONLY; explicit irreversibility)
  "gmail.sendExternal": z.object({ account: accountParam, to: z.string().regex(emailPattern, "EMAIL_INVALID").max(320), subject: z.string().min(1).max(500), body: z.string().min(1).max(50_000), dryRun: dryRunParam }).strict(),
  "calendar.deleteEvent": z.object({ account: accountParam, eventId: z.string().min(1).max(200), dryRun: dryRunParam }).strict(),
  "drive.delete": z.object({ account: accountParam, fileId: z.string().min(1).max(200), permanent: z.literal(true).optional(), dryRun: dryRunParam }).strict(),
} as const;

export type GwsOp = keyof typeof GWS_SCHEMAS;

export const GWS_TIER: Record<GwsOp, GwsTier> = {
  "gmail.list": "T1", "gmail.get": "T1", "calendar.list": "T1", "drive.list": "T1", "contacts.list": "T1",
  "gmail.send": "T2", "gmail.reply": "T2", "calendar.createEvent": "T2", "drive.upload": "T2",
  "drive.update": "T2", "docs.create": "T2", "docs.append": "T2",
  "gmail.sendExternal": "T3", "calendar.deleteEvent": "T3", "drive.delete": "T3",
};

// Secret-shaped values never leave this module even if upstream echoed them.
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(val);
    return out;
  }
  return value;
}

function gwsAudit(entry: Record<string, unknown>): void {
  try {
    mkdirSync(path.dirname(GWS_AUDIT_FILE), { recursive: true, mode: 0o700 });
    appendFileSync(GWS_AUDIT_FILE, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, { mode: 0o600, flag: "a" });
  } catch { /* observability only */ }
}

export type GwsResult = {
  status: "ok" | "error";
  op: string;
  tier: GwsTier;
  durationMs: number;
  data?: Record<string, unknown>;
  error?: string;
};

export function gwsTierOf(op: string): GwsTier {
  return (GWS_TIER as Record<string, GwsTier>)[op] ?? "T1";
}

// runGws — the ONLY network path for Google Workspace tools: validates input
// against the op's strict schema, posts {op, params} to the bridge function
// with the server-side credential header, caps and redacts the response, and
// audits metadata-only. Never throws — callers receive a typed result.
export async function runGws(op: GwsOp, input: unknown, timeoutMs: number = DEFAULT_GWS_TIMEOUT_MS): Promise<GwsResult> {
  const tier = gwsTierOf(op);
  const started = Date.now();
  const schema: unknown = (GWS_SCHEMAS as Record<string, unknown>)[op];
  if (!schema) {
    gwsAudit({ op: String(op), tier, status: "error", error: "GWS_OP_UNKNOWN", durationMs: 0 });
    return { status: "error", op: String(op), tier, durationMs: 0, error: "GWS_OP_UNKNOWN" };
  }
  const parsed = (schema as { safeParse: (i: unknown) => { success: boolean; data?: Record<string, unknown>; error?: { issues: { message: string }[] } } }).safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error?.issues?.[0]?.message ?? "GWS_INPUT_INVALID";
    gwsAudit({ op, tier, status: "error", error: "GWS_INPUT_INVALID", durationMs: Date.now() - started });
    return { status: "error", op, tier, durationMs: Date.now() - started, error: `GWS_INPUT_INVALID: ${reason}` };
  }
  const effectiveTimeoutMs = Math.min(Number(process.env.ENG_MCP_GWS_TIMEOUT_MS ?? DEFAULT_GWS_TIMEOUT_MS), MAX_GWS_TIMEOUT_MS);
  const endpoint = process.env.ENG_MCP_GWS_ENDPOINT ?? DEFAULT_GWS_ENDPOINT;
  const credentialFile = process.env.ENG_MCP_GWS_SECRET_FILE ?? process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE;
  let credential: string;
  if (!credentialFile) {
    gwsAudit({ op, tier, status: "error", error: "GWS_SECRET_UNAVAILABLE", durationMs: Date.now() - started });
    return { status: "error", op, tier, durationMs: Date.now() - started, error: "GWS_SECRET_UNAVAILABLE: credential file env (ENG_MCP_GWS_SECRET_FILE / ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE) not configured" };
  }
  try {
    credential = readFileSync(credentialFile, "utf8").trim();
  } catch {
    gwsAudit({ op, tier, status: "error", error: "GWS_SECRET_UNAVAILABLE", durationMs: Date.now() - started });
    return { status: "error", op, tier, durationMs: Date.now() - started, error: "GWS_SECRET_UNAVAILABLE: credential file unreadable" };
  }
  if (!credential) {
    gwsAudit({ op, tier, status: "error", error: "GWS_SECRET_UNAVAILABLE", durationMs: Date.now() - started });
    return { status: "error", op, tier, durationMs: Date.now() - started, error: "GWS_SECRET_UNAVAILABLE: credential file empty" };
  }
  const headers: Record<string, string> = { "content-type": "application/json", "x-agent-memory-token": credential };
  const finish = (status: "ok" | "error", payload: { data?: Record<string, unknown>; error?: string }): GwsResult => {
    const result: GwsResult = { status, op, tier, durationMs: Date.now() - started, ...payload };
    gwsAudit({ op, tier, status, durationMs: result.durationMs, dryRun: parsed.data?.dryRun === true, error: status === "error" ? result.error?.slice(0, 120) : undefined });
    return result;
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ op, params: parsed.data }),
      redirect: "manual",
      signal: AbortSignal.timeout(effectiveTimeoutMs),
    });
    const rawText = await response.text();
    const text = rawText.length > MAX_RESPONSE_BYTES ? rawText.slice(0, MAX_RESPONSE_BYTES) : rawText;
    let json: Record<string, unknown>;
    try { json = JSON.parse(text) as Record<string, unknown>; } catch {
      return finish("error", { error: `GWS_RESPONSE_INVALID: http ${response.status}, non-JSON body` });
    }
    if (!response.ok) return finish("error", { error: `GWS_HTTP_${response.status}: ${String(json.error ?? "").slice(0, 200)}` });
    if (json.ok !== true) return finish("error", { error: `GWS_OP_ERROR: ${String(json.error ?? "unknown").slice(0, 300)}` });
    const { ok: _ok, ...data } = json;
    return finish("ok", { data: redactValue(data) as Record<string, unknown> });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const code = name === "TimeoutError" ? "GWS_TIMEOUT" : "GWS_NETWORK_ERROR";
    return finish("error", { error: code });
  }
}