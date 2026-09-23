// STORE-MIG-01 PARTE B: local MCP proxy — the same contract the Hermes channel
// consumes through the Base44 engMcpProxy today (gate header X-Proxy-Secret,
// bearer injected server-side), hosted on this server at POST /mcp-proxy so the
// channel leaves Base44 without touching the panel.
//
// Identity model (the whole point):
//   - X-Proxy-Secret is the channel credential. NEW secret, generated on the
//     VPS at first boot (0600 file, hash16-only logging — the value is never
//     returned, logged or echoed).
//   - The bearer presented to the MCP pipeline is read from a credential FILE
//     (hermes-2026-09, read-only scopes) by file reference — never a plain-text
//     env value, never argv (LoadCredential/3-link pattern). The client's own
//     Authorization header is deliberately IGNORED (stripped), exactly like the
//     Base44 proxy did — nobody can smuggle a stronger bearer through this
//     route, so the Hermes channel is read-only BY CONSTRUCTION and mutation
//     attempts die in policy with AUTHORIZATION_SCOPE_REQUIRED (that refusal is
//     the acceptance proof).
//   - 403 {"error":"Forbidden"} for a wrong secret — byte-compatible with the
//     Base44 proxy shape the client already knows.
//   - Fail-closed: missing secret or missing bearer file never invents access.
// Audit: metadata + hash16 only, never secret or bearer values.
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";

export const DEFAULT_PROXY_SECRET_FILE = "/data/credentials/hermes-proxy-secret";
export const DEFAULT_PROXY_BEARER_FILE = "/data/credentials/hermes-2026-09";
export const PROXY_AUDIT_FILE = "/data/audit/mcp-proxy.jsonl";

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

// Generates the channel secret on first boot if absent (the brief's "NOVO,
// gerado na VPS"); returns hash16 only. Callers must treat the return value as
// non-secret metadata.
export function ensureProxySecret(file: string = process.env.ENG_MCP_PROXY_SECRET_FILE ?? DEFAULT_PROXY_SECRET_FILE): { file: string; hash16: string; created: boolean } {
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) return { file, hash16: sha16(existing), created: false };
  } catch { /* create below */ }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort on bind mounts */ }
  return { file, hash16: sha16(secret), created: true };
}

export type McpProxyDeps = {
  // Authenticates the injected bearer against the token registry (throws
  // EngineeringError on revoked/expired/unknown — fail-closed).
  authenticateBearer: (token: string) => { subject?: string } & Record<string, unknown>;
  // Builds the shared stateless MCP handler for a subject (extracted in
  // server.ts so /mcp and /mcp-proxy register the exact same toolset).
  buildMcpHandler: (subject: Record<string, unknown>) => unknown;
  secretFile?: string;
  bearerFile?: string;
  auditFile?: string;
};

export function proxyAudit(depsFile: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(path.dirname(depsFile), { recursive: true });
    appendFileSync(depsFile, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, { mode: 0o600, flag: "a" });
  } catch { /* observability only */ }
}

export async function handleMcpProxyRequest(request: IncomingMessage, response: ServerResponse, deps: McpProxyDeps): Promise<void> {
  const auditFile = deps.auditFile ?? PROXY_AUDIT_FILE;
  const audit = (entry: Record<string, unknown>): void => proxyAudit(auditFile, entry);
  const json = (status: number, body: Record<string, unknown>): void => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  try {
    if (request.method !== "POST") {
      audit({ event: "refused", reason: "method", method: request.method });
      json(405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
    // Gate 1: channel secret (constant-time compare; missing file fails closed).
    const secretFile = deps.secretFile ?? process.env.ENG_MCP_PROXY_SECRET_FILE ?? DEFAULT_PROXY_SECRET_FILE;
    let secret: string;
    try {
      secret = readFileSync(secretFile, "utf8").trim();
      if (!secret) throw new Error("empty");
    } catch {
      audit({ event: "refused", reason: "secret-file-unavailable", secretFile });
      json(503, { error: "PROXY_SECRET_UNAVAILABLE" });
      return;
    }
    const provided = typeof request.headers["x-proxy-secret"] === "string" ? (request.headers["x-proxy-secret"] as string) : "";
    const secretOk = provided.length === secret.length && timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(secret, "utf8"));
    if (!secretOk) {
      // Same shape and status the Base44 engMcpProxy returns for a bad secret.
      audit({ event: "refused", reason: "secret-mismatch", secretHash16: sha16(secret) });
      json(403, { error: "Forbidden" });
      return;
    }
    // Gate 2: fixed read-only identity from the credential file. The client's
    // Authorization header is intentionally never read (stripped by design) —
    // the file token is presented to the pipeline in the SAME wire form the
    // Base44 proxy injected: an "Authorization: Bearer <token>" header value.
    const bearerFile = deps.bearerFile ?? process.env.ENG_MCP_PROXY_BEARER_FILE ?? DEFAULT_PROXY_BEARER_FILE;
    let token: string;
    try {
      token = readFileSync(bearerFile, "utf8").trim();
      if (!token) throw new Error("empty");
    } catch {
      audit({ event: "refused", reason: "bearer-file-unavailable", bearerFile });
      json(503, { error: "PROXY_BEARER_UNAVAILABLE" });
      return;
    }
    let subject: { subject?: string } & Record<string, unknown>;
    try {
      subject = deps.authenticateBearer(`Bearer ${token}`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "ENGINEERING_PROXY_AUTH_FAILED";
      audit({ event: "refused", reason: "bearer-auth", bearerFile, code });
      json(401, { error: code });
      return;
    }
    const handler = deps.buildMcpHandler(subject) as Parameters<typeof toNodeHandler>[0];
    response.once("finish", () => {
      const closable = handler as { close?: () => Promise<void> | void };
      try { void closable.close?.(); } catch { /* handler cleanup */ }
    });
    audit({ event: "proxied", path: "/mcp-proxy", subject: subject.subject ?? "unknown", bearerFile, secretMatched: true });
    await toNodeHandler(handler)(request, response);
  } catch (error) {
    audit({ event: "failed", reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    json(500, { error: "ENGINEERING_PROXY_FAILED" });
  }
}
