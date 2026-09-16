// engineering.web.connector — minimal deterministic bridge from ENG-MCP to the
// EXISTING Playwright MCP servers (playwright-web-connector / playwright-bug-hunter)
// through the existing Base44 agentMemoryBridge gateway (operation mcp_execute).
//
// Non-negotiables (mission):
// - ONE supertool; no planner, no agent loop, no retry, no branching. Steps run
//   sequentially and stop on the first error.
// - Goose NEVER supplies toolName/serverId/server_url/raw MCP args: the
//   action -> tool mapping is internal and validated against the LIVE catalog
//   inputSchemas (24/24 dump, both servers, 2026-09-05).
// - browser_run_code_unsafe and browser_evaluate are IMPOSSIBLE: absent from the
//   action enum AND from the allowlist (defense in depth at both layers).
// - Binary upload: ENG-MCP decodes bounded caller-supplied files into a shared
//   host bind (/opt/memoryos/playwright-staging) that is mounted into the ENG-MCP
//   container and BOTH Playwright containers at the IDENTICAL in-container path.
//   browser_file_upload receives ONLY supertool-generated staging paths; staged
//   files are deleted in finally (success or failure) plus a bounded orphan sweep.
// - No new Playwright, no new MCP server, no persistent file store, no directory
//   listing exposed, no caller-supplied destination paths, MIME is metadata only.

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import * as z from "zod/v4";
import { applyAuthSessionSlot, assertAuthSessionDomain, AuthSessionError, authSessionSlotPaths, defaultAuthSessionManager, type StoredAuthSession } from "./authSession.ts";

// ---- pinned Playwright servers (Base44 MCPServerConfig registry; never caller-supplied) ----
export const PLAYWRIGHT_SERVERS = Object.freeze({
  "web-connector": Object.freeze({ serverId: "6a78ee796cdb3d67b4acdf2d", name: "playwright-web-connector" }),
  "bug-hunter": Object.freeze({ serverId: "6a765c1bb57aee8a937ab86c", name: "playwright-bug-hunter" }),
} as const);
export type PlaywrightServerKey = keyof typeof PLAYWRIGHT_SERVERS;

// ---- exact catalog-confirmed allowlist (24-tool catalogs, 2026-09-05) ----
// browser_run_code_unsafe and browser_evaluate are deliberately ABSENT.
export const PLAYWRIGHT_ALLOWED_TOOLS = Object.freeze([
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_find",
  "browser_click",
  "browser_type",
  "browser_fill_form",
  "browser_press_key",
  "browser_select_option",
  "browser_tabs",
  "browser_wait_for",
  "browser_take_screenshot",
  "browser_console_messages",
  "browser_network_requests",
  "browser_network_request",
  "browser_resize",
  "browser_handle_dialog",
  "browser_drop",
  "browser_file_upload",
] as const);
export const PLAYWRIGHT_DENIED_TOOLS = Object.freeze(["browser_run_code_unsafe", "browser_evaluate"] as const);

// ---- bounded limits (v1) ----
export const MAX_STEPS = 10;
export const MAX_FILES_PER_UPLOAD = 4;
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB decoded, per file
export const DEFAULT_STAGING_ROOT = "/opt/memoryos/playwright-staging";
// The @playwright/mcp 0.0.80 file-access validator rejects paths under the staging
// bind. The SAME host bind is therefore ALSO mounted inside the Playwright MCP
// container at an allowed root; browser_file_upload receives that MCP view path.
// Storage, cleanup and orphan sweep keep using the bind path (single copy, no relay).
export const UPLOAD_VIEW_ROOT = "/tmp/.playwright-mcp/memoryos-staging";
const STAGING_FILE_PATTERN = /^[0-9a-f]{32}_/;
const ORPHAN_MAX_AGE_MS = 10 * 60_000; // no retention beyond this
const ORPHAN_SWEEP_LIMIT = 100;
const MAX_STEP_TEXT_CHARS = 32_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const MAX_CALL_TIMEOUT_MS = 45_000;
const DEFAULT_MEMORY_ENDPOINT = "https://ever-mind-core.base44.app/functions/agentMemoryBridge";
const SENSITIVE_KEY_PATTERN = /authorization|token|secret|api_?key|password|cookie|bearer/i;

// ---- per-action step schemas (exact live catalog shapes, DANGEROUS params removed) ----
// `filename` params (server-side write paths) are NEVER accepted from callers;
// browser_drop `paths` are NEVER accepted (staging paths exist only via upload).
const navigateStep = z.object({ action: z.literal("navigate"), url: z.string().min(1).max(2048) }).strict();
const navigateBackStep = z.object({ action: z.literal("navigate_back") }).strict();
const snapshotStep = z.object({ action: z.literal("snapshot"), depth: z.number().int().min(1).max(30).optional(), target: z.string().min(1).max(500).optional() }).strict();
const findStep = z.object({ action: z.literal("find"), text: z.string().min(1).max(500).optional(), regex: z.string().min(1).max(500).optional() }).strict();
const clickStep = z.object({ action: z.literal("click"), target: z.string().min(1).max(500), element: z.string().max(500).optional(), doubleClick: z.boolean().optional(), button: z.enum(["left", "right", "middle"]).optional(), modifiers: z.array(z.enum(["Alt", "Control", "ControlOrMeta", "Meta", "Shift"])).max(3).optional() }).strict();
const typeStep = z.object({ action: z.literal("type"), target: z.string().min(1).max(500), text: z.string().max(100_000), element: z.string().max(500).optional(), submit: z.boolean().optional(), slowly: z.boolean().optional() }).strict();
const fillFormStep = z.object({
  action: z.literal("fill_form"),
  fields: z.array(z.object({
    target: z.string().min(1).max(500),
    name: z.string().min(1).max(200),
    type: z.enum(["textbox", "checkbox", "radio", "combobox", "slider"]),
    value: z.string().max(100_000),
    element: z.string().max(500).optional(),
  }).strict()).min(1).max(50),
}).strict();
const pressKeyStep = z.object({ action: z.literal("press_key"), key: z.string().min(1).max(100) }).strict();
const selectOptionStep = z.object({ action: z.literal("select_option"), target: z.string().min(1).max(500), values: z.array(z.string().max(500)).min(1).max(100), element: z.string().max(500).optional() }).strict();
const tabsStep = z.object({ action: z.literal("tabs"), tabAction: z.enum(["list", "new", "close", "select"]), index: z.number().int().min(0).max(500).optional(), url: z.string().max(2048).optional() }).strict();
const waitForStep = z.object({ action: z.literal("wait_for"), time: z.number().min(0).max(20).optional(), text: z.string().max(500).optional(), textGone: z.string().max(500).optional() }).strict();
const screenshotStep = z.object({ action: z.literal("screenshot"), type: z.enum(["png", "jpeg", "webp"]).optional(), fullPage: z.boolean().optional(), element: z.string().max(500).optional(), target: z.string().max(500).optional() }).strict();
const consoleMessagesStep = z.object({ action: z.literal("console_messages"), level: z.enum(["error", "warning", "info", "debug"]).optional(), all: z.boolean().optional() }).strict();
const networkRequestsStep = z.object({ action: z.literal("network_requests"), filter: z.string().max(500).optional() }).strict();
const networkRequestStep = z.object({ action: z.literal("network_request"), index: z.number().int().min(1).max(2_000_000_000), part: z.enum(["request-headers", "request-body", "response-headers", "response-body"]).optional() }).strict();
const resizeStep = z.object({ action: z.literal("resize"), width: z.number().int().min(1).max(10_000), height: z.number().int().min(1).max(10_000) }).strict();
const handleDialogStep = z.object({ action: z.literal("handle_dialog"), accept: z.boolean(), promptText: z.string().max(1_000).optional() }).strict();
const dropStep = z.object({ action: z.literal("drop"), target: z.string().min(1).max(500), element: z.string().max(500).optional(), data: z.record(z.string().max(200), z.string().max(1_000_000)).optional() }).strict();
const uploadFileSchema = z.object({ name: z.string().min(1).max(200), mimeType: z.string().min(1).max(200), base64: z.string().min(1).max(4_200_000) }).strict();
const uploadStep = z.object({ action: z.literal("upload"), files: z.array(uploadFileSchema).min(1).max(MAX_FILES_PER_UPLOAD) }).strict();

export const webConnectorInputSchema = z.object({
  server: z.enum(["web-connector", "bug-hunter"]).optional(),
  // Optional opaque auth-session reference (32 hex, from the POST /auth-session
  // ingest route): resolved into a domain-bound temporary session BEFORE any
  // navigation. Absent => v1 behavior identical.
  authSessionRef: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  steps: z.array(
    z.discriminatedUnion("action", [
      navigateStep, navigateBackStep, snapshotStep, findStep, clickStep, typeStep, fillFormStep,
      pressKeyStep, selectOptionStep, tabsStep, waitForStep, screenshotStep, consoleMessagesStep,
      networkRequestsStep, networkRequestStep, resizeStep, handleDialogStep, dropStep, uploadStep,
    ]),
  ).min(1).max(MAX_STEPS),
}).strict();

export type WebConnectorInput = z.infer<typeof webConnectorInputSchema>;

// ---- internal action -> exact Playwright tool mapping (never caller-supplied) ----
const ACTION_TOOLS = Object.freeze({
  navigate: "browser_navigate",
  navigate_back: "browser_navigate_back",
  snapshot: "browser_snapshot",
  find: "browser_find",
  click: "browser_click",
  type: "browser_type",
  fill_form: "browser_fill_form",
  press_key: "browser_press_key",
  select_option: "browser_select_option",
  tabs: "browser_tabs",
  wait_for: "browser_wait_for",
  screenshot: "browser_take_screenshot",
  console_messages: "browser_console_messages",
  network_requests: "browser_network_requests",
  network_request: "browser_network_request",
  resize: "browser_resize",
  handle_dialog: "browser_handle_dialog",
  drop: "browser_drop",
  upload: "browser_file_upload",
} as const);

// Build the upstream tool args. Injects the catalog-required defaults the caller
// may not control (console level, network static, screenshot scale) and strips
// the supertool-only fields (action / tabAction).
function buildToolArgs(step: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...step };
  const action = rest.action as string;
  delete rest.action;
  if (action === "tabs") {
    const out: Record<string, unknown> = { action: rest.tabAction };
    delete rest.tabAction;
    if (rest.index !== undefined) out.index = rest.index;
    if (rest.url !== undefined) out.url = rest.url;
    return out;
  }
  if (action === "console_messages") {
    return { level: rest.level ?? "info", ...(rest.all !== undefined ? { all: rest.all } : {}) };
  }
  if (action === "network_requests") {
    return { static: false, ...(rest.filter !== undefined ? { filter: rest.filter } : {}) };
  }
  if (action === "screenshot") {
    return { scale: "css", ...rest };
  }
  return rest;
}

// ---- upload validation: traversal denied, name normalized, base64 strict, size bounded ----
export function validateUploadFile(file: { name: string; mimeType: string; base64: string }): { ok: true; safeName: string; decodedBytes: number } | { ok: false; reason: string } {
  if (typeof file.name !== "string" || file.name.length === 0) return { ok: false, reason: "FILENAME_REQUIRED" };
  // Path traversal and any path separator are DENIED (not silently rewritten).
  if (/[\\/]/.test(file.name) || file.name.includes("..")) return { ok: false, reason: "FILENAME_TRAVERSAL_DENIED" };
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  if (!safeName || safeName.length > 200 || !/^[A-Za-z0-9._-]+$/.test(safeName)) return { ok: false, reason: "FILENAME_INVALID" };
  // Strict standard base64: complete 4-char groups only (length/alignment implied).
  if (!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) return { ok: false, reason: "BASE64_INVALID" };
  const padding = file.base64.endsWith("==") ? 2 : file.base64.endsWith("=") ? 1 : 0;
  const decodedBytes = Math.floor(file.base64.length / 4) * 3 - padding;
  if (decodedBytes <= 0) return { ok: false, reason: "BASE64_EMPTY" };
  if (decodedBytes > MAX_FILE_BYTES) return { ok: false, reason: "FILE_TOO_LARGE" };
  // mimeType is metadata only: never trusted for security decisions.
  return { ok: true, safeName, decodedBytes };
}

// ---- staging (shared host bind; same path inside ENG-MCP and both Playwright containers) ----
async function sweepOrphans(stagingRoot: string, nowMs: number): Promise<number> {
  let removed = 0;
  try {
    const entries = await readdir(stagingRoot);
    for (const entry of entries) {
      if (removed >= ORPHAN_SWEEP_LIMIT) break;
      if (!STAGING_FILE_PATTERN.test(entry)) continue;
      try {
        const stats = await stat(path.join(stagingRoot, entry));
        if (nowMs - stats.mtimeMs > ORPHAN_MAX_AGE_MS) {
          await rm(path.join(stagingRoot, entry), { force: true });
          removed += 1;
        }
      } catch {
        /* ignore individual orphan errors */
      }
    }
  } catch {
    /* staging root absent or not listable: creation below handles it */
  }
  return removed;
}

async function stageUploadFiles(stagingRoot: string, files: { safeName: string; base64: string }[]): Promise<string[]> {
  await mkdir(stagingRoot, { recursive: true, mode: 0o777 });
  const staged: string[] = [];
  try {
    for (const file of files) {
      const target = path.join(stagingRoot, `${randomBytes(16).toString("hex")}_${file.safeName}`);
      await writeFile(target, Buffer.from(file.base64, "base64"), { mode: 0o644 });
      staged.push(target);
    }
    return staged;
  } catch (error) {
    await cleanupStaged(staged);
    throw error;
  }
}

async function cleanupStaged(staged: string[]): Promise<void> {
  for (const target of staged) {
    try {
      await rm(target, { force: true });
    } catch {
      /* guaranteed-cleanup best effort; nothing retained on success paths */
    }
  }
}

// ---- sequence transport: ONE gateway call (mcp_execute_sequence) so every step
// of a runWebConnector invocation executes in the SAME downstream MCP session and
// the SAME Playwright context. Session scope = this invocation only (gateway
// closes the transport in finally); no global/persistent session state.
// Per-item UMG-3 tool-scoped confirmation is generated server-side, exactly like
// the single-step path; the closed gateway allowlist re-validates every tool.
async function postBridgeSequence(
  serverId: string,
  items: { toolName: string; args: Record<string, unknown> }[],
  timeoutMs: number,
): Promise<WebConnectorSequenceResult> {
  const start = Date.now();
  const endpoint = process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_MEMORY_ENDPOINT;
  let bridgeUrl: string;
  try {
    const parsed = new URL(endpoint);
    bridgeUrl = parsed.pathname.endsWith("/agentMemoryBridge") ? endpoint : `${parsed.origin}/functions/agentMemoryBridge`;
  } catch {
    return { ok: false, status: 0, error: "GATEWAY_ENDPOINT_INVALID", durationMs: Date.now() - start };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  const credentialFile = process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE;
  if (credentialFile) {
    try {
      const token = (await readFile(credentialFile, "utf8")).trim();
      if (token) headers["x-agent-memory-token"] = token;
    } catch {
      /* proceed without token; upstream decides authentication */
    }
  }
  let body: string;
  try {
    body = JSON.stringify({
      serverId,
      operation: "mcp_execute_sequence",
      sequence: items.map((item) => ({
        toolName: item.toolName,
        arguments: item.args,
        confirmation: { toolName: item.toolName }, // UMG-3 tool-scoped confirmation per item
      })),
    });
  } catch {
    return { ok: false, status: 0, error: "REQUEST_BODY_INVALID", durationMs: Date.now() - start };
  }
  let response: Response;
  try {
    response = await fetch(bridgeUrl, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error && error.name === "TimeoutError" ? "GATEWAY_TIMEOUT" : "GATEWAY_NETWORK_ERROR",
      durationMs: Date.now() - start,
    };
  }
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    /* bounded read failure -> empty body */
  }
  if (raw.length > MAX_RESPONSE_BYTES) {
    return { ok: false, status: response.status, error: "GATEWAY_RESPONSE_TRUNCATED", durationMs: Date.now() - start };
  }
  let parsedBody: Record<string, unknown> | null = null;
  if (raw) {
    try {
      parsedBody = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }
  }
  const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
  const okStatus = response.status >= 200 && response.status < 300;
  const parsedOk = isRecord(parsedBody) && parsedBody.ok === true;
  const errObj = isRecord(parsedBody) && isRecord(parsedBody.error) ? parsedBody.error : null;
  const errCode = errObj && typeof errObj.code === "string" ? errObj.code : null;
  const errMsg = errObj && typeof errObj.message === "string" ? errObj.message : null;
  // NOTE: HTTP 200 with ok:false is a VALID partial-sequence response (per-index
  // results carry the failure). Only non-2xx status is a transport-level error.
  if (!okStatus) {
    const base = errCode ?? `HTTP_${response.status}`;
    const detail = errMsg && !base.includes(errMsg) ? `${base}: ${errMsg}` : base;
    return { ok: false, status: response.status, error: detail.slice(0, 500), durationMs: Date.now() - start };
  }
  // Extract per-index results regardless of the top-level ok flag: a partial
  // sequence (HTTP 200, ok:false) still carries valid per-index entries.
  const redacted = isRecord(parsedBody) && Array.isArray(parsedBody.results) ? parsedBody.results.map((entry) => redactValue(entry)) : [];
  return {
    ok: true,
    status: response.status,
    result: { stepsRequested: parsedBody?.stepsRequested, stepsExecuted: parsedBody?.stepsExecuted },
    results: redacted,
    stepsRequested: isRecord(parsedBody) ? Number(parsedBody.stepsRequested ?? items.length) : items.length,
    stepsExecuted: isRecord(parsedBody) ? Number(parsedBody.stepsExecuted ?? 0) : 0,
    durationMs: Date.now() - start,
  };
}

// ---- transport: the existing Base44 gateway (mcp_execute), serverId pinned per server ----
export type WebConnectorCallResult = { ok: boolean; status: number; result?: unknown; error?: string; durationMs: number };
export type WebConnectorSequenceResult = WebConnectorCallResult & {
  results?: Array<Record<string, unknown>>;
  stepsRequested?: number;
  stepsExecuted?: number;
};
export interface WebConnectorTransport {
  name: string;
  call(toolName: string, args: Record<string, unknown>): Promise<WebConnectorCallResult>;
  callSequence(items: { toolName: string; args: Record<string, unknown> }[]): Promise<WebConnectorSequenceResult>;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(item, depth + 1);
  }
  return out;
}

export function createPlaywrightMcpTransport(serverId: string, options: { timeoutMs?: number } = {}): WebConnectorTransport {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS, 1), MAX_CALL_TIMEOUT_MS);
  return {
    name: "base44-mcp_execute-playwright",
    async call(toolName: string, args: Record<string, unknown>): Promise<WebConnectorCallResult> {
      const start = Date.now();
      const endpoint = process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_MEMORY_ENDPOINT;
      let bridgeUrl: string;
      try {
        const parsed = new URL(endpoint);
        bridgeUrl = parsed.pathname.endsWith("/agentMemoryBridge") ? endpoint : `${parsed.origin}/functions/agentMemoryBridge`;
      } catch {
        return { ok: false, status: 0, error: "GATEWAY_ENDPOINT_INVALID", durationMs: Date.now() - start };
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      const credentialFile = process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE;
      if (credentialFile) {
        try {
          const token = (await readFile(credentialFile, "utf8")).trim();
          if (token) headers["x-agent-memory-token"] = token;
        } catch {
          /* proceed without token; upstream decides authentication */
        }
      }
      let body: string;
      try {
        body = JSON.stringify({
          serverId,
          operation: "mcp_execute",
          toolName,
          arguments: args,
          confirmation: { toolName }, // UMG-3 tool-scoped confirmation
        });
      } catch {
        return { ok: false, status: 0, error: "REQUEST_BODY_INVALID", durationMs: Date.now() - start };
      }
      let response: Response;
      try {
        response = await fetch(bridgeUrl, {
          method: "POST",
          headers,
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error && error.name === "TimeoutError" ? "GATEWAY_TIMEOUT" : "GATEWAY_NETWORK_ERROR",
          durationMs: Date.now() - start,
        };
      }
      let raw = "";
      let truncated = false;
      try {
        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder("utf-8", { fatal: false });
          const chunks: Buffer[] = [];
          let bytes = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              bytes += value.byteLength;
              chunks.push(Buffer.from(value));
              if (bytes >= MAX_RESPONSE_BYTES) {
                void reader.cancel().catch(() => {});
                truncated = true;
                break;
              }
            }
          }
          raw = decoder.decode(Buffer.concat(chunks));
        }
      } catch {
        /* bounded read failure -> empty body */
      }
      if (truncated) {
        return { ok: false, status: response.status, error: "GATEWAY_RESPONSE_TRUNCATED", durationMs: Date.now() - start };
      }
      let parsedBody: unknown = null;
      if (raw) {
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          parsedBody = null;
        }
      }
      const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
      const okStatus = response.status >= 200 && response.status < 300;
      const parsedOk = isRecord(parsedBody) && parsedBody.ok === true;
      const errText = isRecord(parsedBody) && typeof parsedBody.error === "string" ? parsedBody.error : null;
      const errObj = isRecord(parsedBody) && isRecord(parsedBody.error) ? parsedBody.error : null;
      const errCode = errObj && typeof errObj.code === "string" ? errObj.code : null;
      const errMsg = errObj && typeof errObj.message === "string" ? errObj.message : null;
      if (!okStatus || (isRecord(parsedBody) && parsedBody.ok === false) || errText !== null) {
        const base = errCode ?? errText ?? `HTTP_${response.status}`;
        const detail = errMsg && !base.includes(errMsg) ? `${base}: ${errMsg}` : base;
        return { ok: false, status: response.status, error: detail.slice(0, 500), durationMs: Date.now() - start };
      }
      return {
        ok: true,
        status: response.status,
        result: parsedOk && isRecord(parsedBody) ? redactValue(parsedBody.result ?? null) : null,
        durationMs: Date.now() - start,
      };
    },
    async callSequence(items: { toolName: string; args: Record<string, unknown> }[]): Promise<WebConnectorSequenceResult> {
      return postBridgeSequence(serverId, items, timeoutMs);
    },
  };
}

// ---- bounded result extraction (no image base64 passthrough, no unbounded text) ----
function boundedStepResult(result: unknown): unknown {
  const record = result !== null && typeof result === "object" ? (result as Record<string, unknown>) : null;
  if (record && Array.isArray(record.content)) {
    const content = (record.content as Record<string, unknown>[]).slice(0, 8).map((item) => {
      if (item && item.type === "text" && typeof item.text === "string") {
        return { type: "text", text: item.text.length > MAX_STEP_TEXT_CHARS ? `${item.text.slice(0, MAX_STEP_TEXT_CHARS)}...[TRUNCATED]` : item.text };
      }
      if (item && item.type === "image") {
        return { type: "image", mimeType: typeof item.mimeType === "string" ? item.mimeType : null, note: "image content withheld (bounded response)" };
      }
      return { type: item && typeof item.type === "string" ? item.type : "unknown" };
    });
    return { content, ...(record.isError === true ? { isError: true } : {}) };
  }
  const serialized = JSON.stringify(redactValue(result)) ?? "null";
  if (serialized.length > MAX_STEP_TEXT_CHARS) return { resultBounded: `${serialized.slice(0, MAX_STEP_TEXT_CHARS)}...[TRUNCATED]` };
  return { result: redactValue(result) };
}

// ---- supertool entry point ----
export type WebConnectorDeps = {
  transport?: WebConnectorTransport;
  stagingRoot?: string;
  now?: () => number;
  authSessionSlot?: Partial<AuthSessionSlotPaths>;
};

export async function runWebConnector(subject: string, input: unknown, deps: WebConnectorDeps = {}): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const evidence: string[] = [];
  const note = (message: string): void => {
    if (evidence.length < 40) evidence.push(message);
  };
  const finish = (result: Record<string, unknown>): Record<string, unknown> => {
    const complete = { ...result, evidence, durationMs: now() - t0 };
    console.log(JSON.stringify({ event: "engineering.web.connector", subject, status: String(complete.status ?? "UNKNOWN"), steps: Number(complete.stepsExecuted ?? 0) }));
    return JSON.parse(JSON.stringify(complete)) as Record<string, unknown>;
  };

  // Phase 0: input validation. Unknown/extra keys (toolName, serverId, server_url,
  // paths, ...) are impossible: the schema is strict and the action enum is closed.
  const parsed = webConnectorInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 500);
    return finish({ status: "INPUT_INVALID", error: "INPUT_SCHEMA_REJECTED", detail });
  }
  // Phase 0.5 (optional auth-session): resolve the opaque ref and bind it to the
  // FIRST navigation target BEFORE any staging, gateway call or browser action.
  // Fail-closed: unknown/expired ref, missing navigation or domain mismatch all
  // reject without executing any step. No ref => behavior identical to v1.
  let authSession: StoredAuthSession | null = null;
  if (parsed.data.authSessionRef) {
    try {
      const firstNavigation = parsed.data.steps.find((step) => step.action === "navigate");
      if (!firstNavigation) throw new AuthSessionError("AUTH_SESSION_DOMAIN_UNVERIFIABLE", "authSessionRef requires at least one navigate step");
      authSession = defaultAuthSessionManager.resolve(parsed.data.authSessionRef, now());
      assertAuthSessionDomain(authSession.domain, firstNavigation.url);
    } catch (error) {
      return finish({ status: "AUTH_SESSION_REJECTED", error: error instanceof AuthSessionError ? error.code : "AUTH_SESSION_INVALID", failedStep: 0, stepsExecuted: 0 });
    }
  }
  const serverKey: PlaywrightServerKey = parsed.data.server ?? "web-connector";
  const server = PLAYWRIGHT_SERVERS[serverKey];
  const transport = deps.transport ?? createPlaywrightMcpTransport(server.serverId);
  const stagingRoot = deps.stagingRoot ?? DEFAULT_STAGING_ROOT;

  // Phase 1: defense in depth — every mapped tool must be in the frozen allowlist.
  for (const [index, step] of parsed.data.steps.entries()) {
    const toolName = ACTION_TOOLS[step.action];
    if (!(PLAYWRIGHT_ALLOWED_TOOLS as readonly string[]).includes(toolName)) {
      return finish({ status: "DENIED", error: `TOOL_NOT_ALLOWLISTED:${toolName}`, failedStep: index, stepsExecuted: 0 });
    }
  }

  // Phase 2: sequential deterministic execution in ONE downstream MCP session
  // (mcp_execute_sequence): all steps ride a single gateway call so the Playwright
  // context persists across steps (fixes cross-step about:blank). Stop-on-first-
  // error is enforced gateway-side and mirrored below. Staging for ALL upload
  // steps is prepared up-front (paths must exist before the sequence executes)
  // and ALWAYS cleaned in the outer finally, success or failure.
  const results: Record<string, unknown>[] = [];
  const allStaged: string[] = [];
  try {
    const items: { toolName: string; args: Record<string, unknown> }[] = [];
    for (const [index, step] of parsed.data.steps.entries()) {
      const toolName = ACTION_TOOLS[step.action];
      if (step.action === "upload") {
        const validated: { safeName: string; base64: string }[] = [];
        for (const file of step.files) {
          const verdict = validateUploadFile(file);
          if (!verdict.ok) return finish({ status: "INPUT_INVALID", error: verdict.reason, failedStep: index, stepsExecuted: results.length });
          validated.push({ safeName: verdict.safeName, base64: file.base64 });
        }
        const orphans = await sweepOrphans(stagingRoot, now());
        if (orphans > 0) note(`orphan sweep removed ${orphans} expired file(s)`);
        const staged = await stageUploadFiles(stagingRoot, validated);
        allStaged.push(...staged);
        note(`staged ${staged.length} file(s) under staging root`);
        items.push({ toolName, args: { paths: staged.map((p) => path.join(UPLOAD_VIEW_ROOT, path.basename(p))) } });
      } else {
        items.push({ toolName, args: buildToolArgs(step as unknown as Record<string, unknown>) });
      }
    }
    // With authSessionRef the sequence runs through the auth-session slot: the
    // session storageState is written to the shared-bind contextOptions file
    // BEFORE the gateway call (fresh MCP session => fresh Playwright context
    // reads it at context creation, i.e. BEFORE navigation) and the fallback
    // content is restored in finally, so ref-less runs keep v1 behavior identical.
    const runSequence = async (): Promise<Record<string, unknown> | undefined> => {
      const seq = await transport.callSequence(items);
      const seqResults = Array.isArray(seq.results) ? seq.results : [];
      // Transport-level failure ONLY when there are no per-index results: a
      // partial sequence (HTTP 200, ok:false) still carries valid entries and is
      // resolved step-by-step below (stop-on-first-error).
      if (!seq.ok && seqResults.length === 0) {
        return finish({
          status: "STEP_FAILED",
          failedStep: 0,
          toolName: items[0]?.toolName,
          error: seq.error ?? "UPSTREAM_ERROR",
          upstreamStatus: seq.status,
          server: { key: serverKey, serverId: server.serverId, name: server.name },
          results,
          stepsExecuted: results.length,
        });
      }
      let executed = 0;
      for (const entry of seqResults) {
        const rec = entry as Record<string, unknown>;
        const idx = Number(rec.index ?? executed);
        const toolName = String(rec.toolName ?? items[idx]?.toolName ?? "");
        if (rec.ok !== true) {
          const errObj = rec.error as Record<string, unknown> | undefined;
          return finish({
            status: "STEP_FAILED",
            failedStep: idx,
            toolName,
            error: errObj ? String(errObj.message ?? "UPSTREAM_ERROR") : "UPSTREAM_ERROR",
            server: { key: serverKey, serverId: server.serverId, name: server.name },
            results,
            stepsExecuted: executed,
          });
        }
        results.push({ step: idx, action: parsed.data.steps[idx]?.action, tool: toolName, result: boundedStepResult(rec.result) });
        executed++;
      }
      if (executed !== items.length) {
        return finish({
          status: "STEP_FAILED",
          failedStep: executed,
          toolName: items[executed]?.toolName ?? "",
          error: "SEQUENCE_INCOMPLETE",
          server: { key: serverKey, serverId: server.serverId, name: server.name },
          results,
          stepsExecuted: executed,
        });
      }
      return undefined;
    };
    if (authSession) {
      const outcome = await applyAuthSessionSlot(authSessionSlotPaths(deps.authSessionSlot), authSession, runSequence);
      if (outcome) return outcome;
      note(`auth session applied to context slot (domain=${authSession.domain}, cookies=${authSession.storageState.cookies.length})`);
    } else {
      const outcome = await runSequence();
      if (outcome) return outcome;
    }
  } catch (error) {
    return finish({
      status: "STEP_FAILED",
      failedStep: results.length,
      error: error instanceof Error ? error.message : "STAGING_ERROR",
      server: { key: serverKey, serverId: server.serverId, name: server.name },
      results,
      stepsExecuted: results.length,
    });
  } finally {
    if (allStaged.length > 0) {
      await cleanupStaged(allStaged);
      note(`cleaned ${allStaged.length} staged file(s)`);
    }
  }
  return finish({
    status: "OK",
    authSession: authSession ? { ref: authSession.ref, domain: authSession.domain, expiresAt: authSession.expiresAt } : undefined,
    server: { key: serverKey, serverId: server.serverId, name: server.name },
    stepsRequested: parsed.data.steps.length,
    stepsExecuted: results.length,
    results,
  });
}
