// engineering auth-session transport — the MINIMAL bridge that lets the existing
// Chrome extension deliver a domain-scoped Playwright storageState to ENG-MCP and
// lets engineering.web.connector apply it to the remote Playwright BrowserContext
// BEFORE navigation via the already-mounted shared staging bind slot file.
//
// Non-negotiables (mission):
// - Opaque refs only: callers NEVER see cookies, storageState, tokens or paths.
// - Domain-bound: every ingested cookie must belong to the session domain, and a
//   run may only use a session whose domain covers its first navigation URL.
// - Short TTL, in-memory only: no database, no vault, no queue, no persistence.
// - Fail-closed: unknown/expired refs, foreign-domain cookies, unverifiable
//   navigation targets and missing fallback slot content all reject cleanly.
// - Never log, never echo cookie values; logs carry counts, domain and ref prefix.
// - Ingest is token-gated with a dedicated sha256 token-hash file (mirror of the
//   proven imageEdit relay token pattern); no caller-supplied secrets, paths,
//   endpoints or raw auth material are ever accepted.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as z from "zod/v4";

// ---- bounded limits (v1) ----
export const AUTH_SESSION_TTL_MINUTES_DEFAULT = 15;
export const AUTH_SESSION_TTL_MINUTES_MAX = 60;
export const AUTH_SESSION_MAX_SESSIONS = 50;
export const AUTH_SESSION_MAX_COOKIES = 120;
export const AUTH_SESSION_MAX_ORIGINS = 20;
export const AUTH_SESSION_MAX_BODY_BYTES = 1_000_000;
const AUTH_SESSION_REF_PATTERN = /^[0-9a-f]{32}$/;
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

export const DEFAULT_AUTH_SESSION_SLOT_PATH = "/opt/memoryos/playwright-staging/auth-session-active.json";
export const DEFAULT_AUTH_SESSION_FALLBACK_PATH = "/opt/memoryos/playwright-staging/auth-session-fallback.json";

// ---- errors (codes only cross the boundary; messages never carry secret values) ----
export class AuthSessionError extends Error {
  public readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "AuthSessionError";
    this.code = code;
  }
}

// ---- payload schemas: EXACTLY the Playwright storageState shape the extension
// already knows how to produce (chrome.cookies -> playwright cookie fields). ----
const authCookieSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().max(4096),
  domain: z.string().min(1).max(253),
  path: z.string().max(256).default("/"),
  // Chrome/CDP expirationDate is a double with fractional seconds (proven from
  // real extension exports); Playwright storageState carries it as-is — accept
  // the real format, keep the -1 sentinel and the upper bound.
  expires: z.number().min(-1).max(4_102_444_800).default(-1),
  httpOnly: z.boolean().default(false),
  secure: z.boolean().default(false),
  sameSite: z.enum(["Strict", "Lax", "None"]).default("Lax"),
}).strict();
const authOriginSchema = z.object({
  origin: z.string().min(1).max(200),
  localStorage: z.array(z.object({ name: z.string().min(1).max(256), value: z.string().max(16_384) }).strict()).max(50).default([]),
}).strict();
export const authSessionIngestSchema = z.object({
  domain: z.string().min(4).max(253).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/),
  storageState: z.object({
    cookies: z.array(authCookieSchema).min(1).max(AUTH_SESSION_MAX_COOKIES),
    origins: z.array(authOriginSchema).max(AUTH_SESSION_MAX_ORIGINS).default([]),
  }).strict(),
  ttlMinutes: z.number().int().min(1).max(AUTH_SESSION_TTL_MINUTES_MAX).optional(),
}).strict();
export type AuthSessionIngest = z.infer<typeof authSessionIngestSchema>;

// ---- in-memory temporary store (single process; restart == fail-closed empty) ----
export type StoredAuthSession = {
  ref: string;
  domain: string;
  storageState: { cookies: Array<z.infer<typeof authCookieSchema>>; origins: Array<z.infer<typeof authOriginSchema>> };
  expiresAt: number;
  createdAt: number;
};
export type AuthSessionIngestReceipt = { authSessionRef: string; domain: string; expiresAt: number; cookieCount: number };

function summarizeIssues(error: z.ZodError): string {
  return error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}:${issue.code}`).join("; ").slice(0, 300);
}

function cookieDomainWithin(cookieDomain: string, sessionDomain: string): boolean {
  const d = cookieDomain.toLowerCase().replace(/^\./, "");
  const s = sessionDomain.toLowerCase();
  return d === s || d.endsWith("." + s);
}

export class AuthSessionManager {
  private readonly sessions = new Map<string, StoredAuthSession>();
  private readonly options: { maxSessions?: number };
  constructor(options: { maxSessions?: number } = {}) {
    this.options = options;
  }
  get size(): number { return this.sessions.size; }
  sweep(nowMs: number): number {
    let removed = 0;
    for (const [ref, session] of this.sessions) {
      if (nowMs >= session.expiresAt) { this.sessions.delete(ref); removed += 1; }
    }
    return removed;
  }
  ingest(payload: unknown, nowMs: number = Date.now()): AuthSessionIngestReceipt {
    this.sweep(nowMs);
    if (this.sessions.size >= (this.options.maxSessions ?? AUTH_SESSION_MAX_SESSIONS)) {
      throw new AuthSessionError("AUTH_SESSION_STORE_FULL");
    }
    const parsed = authSessionIngestSchema.safeParse(payload);
    if (!parsed.success) throw new AuthSessionError("AUTH_SESSION_PAYLOAD_INVALID", summarizeIssues(parsed.error));
    const domain = parsed.data.domain.toLowerCase();
    for (const cookie of parsed.data.storageState.cookies) {
      if (!cookieDomainWithin(cookie.domain, domain)) {
        throw new AuthSessionError("AUTH_SESSION_DOMAIN_MISMATCH", "ingested cookie domain outside the session domain");
      }
    }
    const ttlMinutes = parsed.data.ttlMinutes ?? AUTH_SESSION_TTL_MINUTES_DEFAULT;
    const ref = randomBytes(16).toString("hex");
    const entry: StoredAuthSession = {
      ref,
      domain,
      storageState: parsed.data.storageState,
      expiresAt: nowMs + ttlMinutes * 60_000,
      createdAt: nowMs,
    };
    this.sessions.set(ref, entry);
    return { authSessionRef: ref, domain, expiresAt: entry.expiresAt, cookieCount: entry.storageState.cookies.length };
  }
  resolve(ref: string, nowMs: number = Date.now()): StoredAuthSession {
    if (!AUTH_SESSION_REF_PATTERN.test(ref)) throw new AuthSessionError("AUTH_SESSION_NOT_FOUND");
    const session = this.sessions.get(ref);
    if (!session) throw new AuthSessionError("AUTH_SESSION_NOT_FOUND");
    if (nowMs >= session.expiresAt) {
      this.sessions.delete(ref);
      throw new AuthSessionError("AUTH_SESSION_EXPIRED");
    }
    return session;
  }
}

// Module-level singleton for the live server; tests construct their own managers.
export const defaultAuthSessionManager = new AuthSessionManager();

// ---- domain binding: a run may only navigate where the session domain covers ----
export function assertAuthSessionDomain(sessionDomain: string, url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new AuthSessionError("AUTH_SESSION_DOMAIN_MISMATCH", "navigation url is not parseable");
  }
  const domain = sessionDomain.toLowerCase();
  if (host !== domain && !host.endsWith("." + domain)) {
    throw new AuthSessionError("AUTH_SESSION_DOMAIN_MISMATCH", "navigation host outside the session domain");
  }
}

// ---- slot application: BEFORE the sequence, the session storageState becomes the
// contextOptions.storageState file the remote connector reads at context creation
// (fresh MCP session per invocation => fresh context per invocation). AFTER the
// sequence (finally), the fallback content is restored so ref-less runs keep the
// exact pre-existing behavior. A single-process mutex serializes slot swaps. ----
export type AuthSessionSlotPaths = { slotPath: string; fallbackPath: string };
export function authSessionSlotPaths(overrides?: Partial<AuthSessionSlotPaths>): AuthSessionSlotPaths {
  return {
    slotPath: overrides?.slotPath ?? process.env.ENG_MCP_AUTH_SESSION_SLOT ?? DEFAULT_AUTH_SESSION_SLOT_PATH,
    fallbackPath: overrides?.fallbackPath ?? process.env.ENG_MCP_AUTH_SESSION_FALLBACK ?? DEFAULT_AUTH_SESSION_FALLBACK_PATH,
  };
}
let slotChain: Promise<unknown> = Promise.resolve();
export async function applyAuthSessionSlot<T>(paths: AuthSessionSlotPaths, session: StoredAuthSession, run: () => Promise<T>): Promise<T> {
  const exec = async (): Promise<T> => {
    let fallback: string;
    try {
      fallback = await readFile(paths.fallbackPath, "utf8");
    } catch {
      throw new AuthSessionError("AUTH_SESSION_FALLBACK_MISSING", "auth-session fallback slot content is not available");
    }
    await writeFile(paths.slotPath, JSON.stringify(session.storageState), { mode: 0o600 });
    try {
      return await run();
    } finally {
      try {
        await writeFile(paths.slotPath, fallback, { mode: 0o600 });
      } catch {
        /* best-effort restore; the next apply overwrites the slot anyway */
      }
    }
  };
  const outcome = slotChain.then(exec, exec);
  slotChain = outcome.then(() => undefined, () => undefined);
  return outcome;
}

// ---- ingest token: raw 64-hex token presented by the extension; only its
// sha256 is stored server-side (tolerant loader: JSON {tokenHash} or bare hex). ----
export function authSessionTokenFilePath(): string {
  return process.env.ENG_MCP_AUTH_SESSION_TOKEN_FILE
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "auth-session.token.json");
}
let cachedTokenHash: string | null | undefined;
export function resetAuthSessionTokenCache(): void { cachedTokenHash = undefined; }
export async function verifyAuthSessionToken(presented: unknown): Promise<boolean> {
  if (typeof presented !== "string" || !TOKEN_HASH_PATTERN.test(presented)) return false;
  if (cachedTokenHash === undefined) {
    try {
      const raw = (await readFile(authSessionTokenFilePath(), "utf8")).trim();
      let value = raw;
      try {
        const parsed = JSON.parse(raw) as { tokenHash?: unknown };
        if (typeof parsed.tokenHash === "string") value = parsed.tokenHash;
      } catch { /* bare hex token-hash file */ }
      cachedTokenHash = TOKEN_HASH_PATTERN.test(value) ? value : null;
    } catch {
      cachedTokenHash = null;
    }
  }
  if (!cachedTokenHash) return false;
  const digest = createHash("sha256").update(presented).digest("hex");
  return timingSafeEqual(Buffer.from(digest), Buffer.from(cachedTokenHash));
}

// ---- HTTP route: POST /auth-session (ingest) + OPTIONS (CORS preflight) ----
const AUTH_SESSION_ROUTE = "/auth-session";
function authSessionCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
  };
}
function writeAuthSessionJson(response: ServerResponse, status: number, payload: Record<string, unknown>): void {
  response.writeHead(status, { "content-type": "application/json", ...authSessionCorsHeaders() });
  response.end(JSON.stringify(payload));
}
async function readBoundedBody(request: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let overflow = false;
    request.on("data", (chunk: Buffer) => {
      if (overflow) return;
      bytes += chunk.length;
      if (bytes > maxBytes) { overflow = true; resolve(null); request.resume(); return; }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => { if (!overflow) resolve(Buffer.concat(chunks).toString("utf8")); });
    request.on("error", () => { if (!overflow) resolve(""); });
  });
}
export function handleAuthSessionRequest(request: IncomingMessage, response: ServerResponse): boolean {
  const pathname = (request.url ?? "").split("?")[0];
  if (pathname !== AUTH_SESSION_ROUTE) return false;
  if (request.method === "OPTIONS") {
    response.writeHead(204, authSessionCorsHeaders());
    response.end();
    return true;
  }
  if (request.method !== "POST") {
    writeAuthSessionJson(response, 405, { error: "AUTH_SESSION_METHOD_NOT_ALLOWED" });
    return true;
  }
  void (async () => {
    try {
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization ?? ""));
      if (!(await verifyAuthSessionToken(bearerMatch?.[1] ?? null))) {
        return writeAuthSessionJson(response, 401, { error: "AUTH_SESSION_INGEST_UNAUTHORIZED" });
      }
      const body = await readBoundedBody(request, AUTH_SESSION_MAX_BODY_BYTES);
      if (body === null) return writeAuthSessionJson(response, 413, { error: "AUTH_SESSION_PAYLOAD_TOO_LARGE" });
      if (body.length === 0) return writeAuthSessionJson(response, 400, { error: "AUTH_SESSION_PAYLOAD_INVALID", detail: "BODY_EMPTY" });
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(body);
      } catch {
        return writeAuthSessionJson(response, 400, { error: "AUTH_SESSION_PAYLOAD_INVALID", detail: "BODY_NOT_JSON" });
      }
      const receipt = defaultAuthSessionManager.ingest(parsedJson);
      console.log(JSON.stringify({
        event: "auth-session.ingest",
        domain: receipt.domain,
        cookieCount: receipt.cookieCount,
        ref: `${receipt.authSessionRef.slice(0, 8)}…`,
        ttlRemainingMs: Math.max(0, receipt.expiresAt - Date.now()),
      }));
      return writeAuthSessionJson(response, 200, { ok: true, ...receipt });
    } catch (error) {
      if (error instanceof AuthSessionError) {
        const badRequest = error.code === "AUTH_SESSION_PAYLOAD_INVALID"
          || error.code === "AUTH_SESSION_DOMAIN_MISMATCH"
          || error.code === "AUTH_SESSION_STORE_FULL";
        return writeAuthSessionJson(response, badRequest ? 400 : 500, { error: error.code });
      }
      return writeAuthSessionJson(response, 500, { error: "AUTH_SESSION_INGEST_FAILED" });
    }
  })();
  return true;
}
