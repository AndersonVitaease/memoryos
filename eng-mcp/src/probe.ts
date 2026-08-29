import { readFile } from "node:fs/promises";

// engineering.runtime.http_probe — controlled HTTP diagnostic probe.
// Closed allowlists only: no free-form URLs, no arbitrary env reads, no shell,
// no PUT/PATCH/DELETE, redirects never followed. The credential is resolved
// server-side from the official credential file and is never returned, logged,
// or echoed by this module.

const DEFAULT_ENDPOINT = "https://ever-mind-core.base44.app/functions/agentMemoryBridge";
const REDACTED = "[REDACTED]";
const ALLOWED_METHODS: ReadonlySet<string> = new Set(["GET", "POST"]);
const ALLOWED_CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(["x-agent-memory-token"]);
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BODY_BYTES = 16_384;
const MAX_RESPONSE_BYTES = 65_536;
const MAX_PATH_LENGTH = 256;
const SENSITIVE_KEY_PATTERN = /authorization|token|secret|api_?key|password|cookie/i;

function targetOrigins(): Record<string, string> {
  // "base44" reuses the already-configured agent-memory endpoint origin; no
  // unknown URL is hardcoded here. Override stays bounded to that config.
  const endpoint = process.env.ENG_MCP_AGENT_MEMORY_ENDPOINT ?? DEFAULT_ENDPOINT;
  return { base44: new URL(endpoint).origin };
}

function credentialSources(): Record<string, string | undefined> {
  // credentialRef → official credential file (same channel as AgentMemoryClient.token()).
  return { AGENT_MEMORY_MCP_SECRET: process.env.ENG_MCP_AGENT_MEMORY_CREDENTIAL_FILE };
}

export type HttpProbeInput = {
  target: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  credentialRef?: string;
  credentialHeader?: string;
  timeoutMs?: number;
};

export type HttpProbeResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  body: unknown;
  truncated: boolean;
  error: string | null;
};

export function validateProbePath(input: string): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_PATH_LENGTH) return null;
  if (!input.startsWith("/") || input.startsWith("//")) return null;
  const lowered = input.toLowerCase();
  if (lowered.includes("..") || lowered.includes("\\") || lowered.includes("@")) return null;
  if (lowered.includes("?") || lowered.includes("#") || lowered.includes("%")) return null;
  if (/\s|[\x00-\x1f\x7f]/.test(input)) return null;
  if (/https?:/.test(lowered) || /^[a-z][a-z0-9+.-]*:/i.test(input)) return null;
  return input;
}

function redact(value: unknown, secrets: string[], depth = 0): unknown {
  if (typeof value === "string") {
    let text = value;
    for (const secret of secrets) {
      if (secret.length >= 4 && text.includes(secret)) text = text.split(secret).join(REDACTED);
    }
    return text;
  }
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redact(item, secrets, depth + 1));
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(child, secrets, depth + 1);
    }
    return output;
  }
  return value;
}

function audit(subject: string, target: string, method: string, path: string, status: number, durationMs: number, success: boolean): void {
  // Never logs headers, request/response bodies, or credential values.
  console.log(JSON.stringify({ event: "engineering.runtime.http_probe", subject, target, method, path, status, durationMs, success }));
}

export async function runHttpProbe(subject: string, input: HttpProbeInput): Promise<HttpProbeResult> {
  const start = Date.now();
  let auditedPath = "(rejected)";
  const result = await executeProbe(input, start, (path: string) => { auditedPath = path; });
  audit(subject, String(input.target).slice(0, 64), ALLOWED_METHODS.has(input.method) ? input.method : "(rejected)", auditedPath, result.status, result.durationMs, result.ok);
  return result;
}

async function executeProbe(input: HttpProbeInput, start: number, onValidatedPath: (path: string) => void): Promise<HttpProbeResult> {
  const fail = (status: number, error: string): HttpProbeResult => ({ ok: false, status, durationMs: Date.now() - start, body: null, truncated: false, error });

  const origin = targetOrigins()[input.target];
  if (!origin) return fail(400, "TARGET_NOT_ALLOWED");
  if (!ALLOWED_METHODS.has(input.method)) return fail(400, "METHOD_NOT_ALLOWED");
  const path = validateProbePath(input.path);
  if (!path) return fail(400, "PATH_NOT_ALLOWED");
  onValidatedPath(path);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) return fail(400, "TIMEOUT_OUT_OF_RANGE");
  if (Boolean(input.credentialRef) !== Boolean(input.credentialHeader)) return fail(400, "CREDENTIAL_PAIR_REQUIRED");
  if (input.method === "GET" && input.body !== undefined) return fail(400, "BODY_NOT_ALLOWED_FOR_GET");
  if (input.body !== undefined && (input.body === null || typeof input.body !== "object" || Array.isArray(input.body))) return fail(400, "BODY_MUST_BE_OBJECT");

  const headers: Record<string, string> = input.method === "POST" ? { "content-type": "application/json" } : {};
  const secrets: string[] = [];
  if (input.credentialRef && input.credentialHeader) {
    const source = credentialSources()[input.credentialRef];
    if (!source) return fail(400, "CREDENTIAL_REF_NOT_ALLOWED");
    if (!ALLOWED_CREDENTIAL_HEADERS.has(input.credentialHeader)) return fail(400, "CREDENTIAL_HEADER_NOT_ALLOWED");
    let value = "";
    try { value = (await readFile(source, "utf8")).trim(); } catch { return fail(400, "CREDENTIAL_UNAVAILABLE"); }
    if (!value) return fail(400, "CREDENTIAL_UNAVAILABLE");
    headers[input.credentialHeader] = value;
    secrets.push(value);
  }

  let requestBody: string | undefined;
  if (input.body !== undefined) {
    try { requestBody = JSON.stringify(input.body); } catch { return fail(400, "REQUEST_BODY_INVALID"); }
    if (requestBody === undefined || Buffer.byteLength(requestBody, "utf8") > MAX_REQUEST_BODY_BYTES) return fail(400, "REQUEST_BODY_TOO_LARGE");
  }

  let response: Response;
  try {
    response = await fetch(`${origin}${path}`, {
      method: input.method,
      headers,
      body: input.method === "POST" ? requestBody : undefined,
      redirect: "manual", // never follows redirects → never leaves the allowlisted origin
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return fail(0, timedOut ? "PROBE_TIMEOUT" : "PROBE_NETWORK_ERROR");
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
          if (bytes >= MAX_RESPONSE_BYTES) { truncated = true; void reader.cancel().catch(() => {}); break; }
        }
      }
      raw = decoder.decode(Buffer.concat(chunks));
      if (raw.length > MAX_RESPONSE_BYTES) raw = raw.slice(0, MAX_RESPONSE_BYTES);
    }
  } catch { /* bounded read failure → empty body */ }

  let parsed: unknown = null;
  if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
  let body: unknown = redact(parsed, secrets);
  const serialized = JSON.stringify(body) ?? "";
  if (secrets.some((secret) => serialized.includes(secret))) body = REDACTED;

  const ok = response.status >= 200 && response.status < 300;
  return {
    ok,
    status: response.status,
    durationMs: Date.now() - start,
    body,
    truncated,
    error: ok ? null : (response.status >= 300 && response.status < 400 ? "REDIRECT_NOT_FOLLOWED" : `HTTP_${response.status}`)
  };
}
