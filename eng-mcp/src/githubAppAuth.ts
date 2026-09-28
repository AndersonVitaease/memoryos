// GH-APP-TOKEN-01: GitHub App installation-token auth for the eng-mcp GitHub
// consumers. Replaces the operator-rotated user PAT with a token that rotates
// itself: a short-lived RS256 JWT (iss = App ID, iat/exp inside GitHub's 10 min
// ceiling) signed with the App private key is exchanged at
// POST /app/installations/{id}/access_tokens for an installation token (~1h).
// The installation token lives ONLY in module memory, is reused while it has
// more than REFRESH_MARGIN_MS of life left and is re-minted on demand after
// that — nothing is ever written to disk or logs. Concurrent callers share one
// in-flight exchange (single-flight).
//
// Configuration (all three required; partial config fails closed, it never
// silently degrades to the PAT):
//   GITHUB_APP_ID                 numeric App ID (not a secret)
//   GITHUB_INSTALLATION_ID        numeric installation ID (not a secret)
//   GITHUB_APP_PRIVATE_KEY_FILE   PEM path, default
//                                 /opt/eng-mcp-secrets/github-app.private-key.pem
// Absent App config (no ID vars at all) → resolveGithubAuth() falls back to the
// PAT resolver the caller passes in (transition path, zero break). App present
// → App wins.
//
// Fail-closed errors never carry the PEM, the JWT or any token: every detail
// passes through scrubGitHubAppSecrets and identifiers are reported as sha16.
import { createHash, createPrivateKey, createPublicKey, createSign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

export const DEFAULT_GITHUB_APP_PRIVATE_KEY_FILE = "/opt/eng-mcp-secrets/github-app.private-key.pem";
const REFRESH_MARGIN_MS = 5 * 60_000;
const JWT_BACKDATE_S = 60;
const JWT_TTL_S = 9 * 60;

export class GitHubAppAuthError extends Error {
  readonly detail?: string;
  constructor(readonly code: string, detail?: string) {
    // Scrubbed at construction: nothing downstream (wrappers, logs) can reach
    // the raw text, even if it re-wraps .detail instead of .message.
    const scrubbed = detail === undefined ? undefined : scrubGitHubAppSecrets(detail);
    super(scrubbed ? `${code}:${scrubbed}` : code);
    this.detail = scrubbed;
    this.name = "GitHubAppAuthError";
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /gh[pousr]_[A-Za-z0-9_]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g,
  /Bearer\s+\S+/g
];

export function scrubGitHubAppSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[REDACTED_SECRET]");
  return out.slice(0, 500);
}

export function sha16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export type GitHubAppConfig = { appId: string; installationId: string; privateKeyFile: string };

// null = App not configured at all (PAT fallback allowed). Throws on partial or
// malformed config: an operator who set one ID meant App mode.
export function readGitHubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig | null {
  const appId = env.GITHUB_APP_ID?.trim() ?? "";
  const installationId = env.GITHUB_INSTALLATION_ID?.trim() ?? "";
  if (appId === "" && installationId === "") return null;
  if (appId === "" || installationId === "") {
    throw new GitHubAppAuthError("GITHUB_APP_CONFIG_INCOMPLETE", `both GITHUB_APP_ID and GITHUB_INSTALLATION_ID are required (appId set: ${appId !== ""}, installationId set: ${installationId !== ""})`);
  }
  if (!/^\d{1,20}$/.test(appId) || !/^\d{1,20}$/.test(installationId)) {
    throw new GitHubAppAuthError("GITHUB_APP_CONFIG_INVALID", `GITHUB_APP_ID and GITHUB_INSTALLATION_ID must be numeric (appId sha16=${sha16(appId)}, installationId sha16=${sha16(installationId)})`);
  }
  const privateKeyFile = env.GITHUB_APP_PRIVATE_KEY_FILE?.trim() || DEFAULT_GITHUB_APP_PRIVATE_KEY_FILE;
  return { appId, installationId, privateKeyFile };
}

function apiBase(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.ENG_MCP_GITHUB_APP_API_BASE?.trim();
  if (!raw) return "https://api.github.com";
  // Test/verify override only: https anywhere, plain http only on loopback, so a
  // stray env value cannot ship the JWT over cleartext to a remote host.
  if (/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(raw) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(raw)) return raw;
  throw new GitHubAppAuthError("GITHUB_APP_CONFIG_INVALID", "ENG_MCP_GITHUB_APP_API_BASE must be https://host[:port] or http://127.0.0.1[:port]");
}

function timeoutMs(): number {
  const raw = Number(process.env.ENG_MCP_GITHUB_TIMEOUT_MS);
  return Number.isInteger(raw) && raw >= 250 ? raw : 10_000;
}

export function loadPrivateKey(config: GitHubAppConfig): KeyObject {
  let pem: string;
  try { pem = readFileSync(config.privateKeyFile, "utf8"); }
  catch { throw new GitHubAppAuthError("GITHUB_APP_KEY_UNREADABLE", `private key file not readable (path sha16=${sha16(config.privateKeyFile)})`); }
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
    return key;
  } catch {
    throw new GitHubAppAuthError("GITHUB_APP_KEY_INVALID", `private key file is not an RSA PEM (path sha16=${sha16(config.privateKeyFile)})`);
  }
}

// sha16 of the SPKI DER — the public identity of the key, safe to report.
export function publicKeyFingerprint(key: KeyObject): string {
  return createHash("sha256").update(createPublicKey(key).export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function mintAppJwt(appId: string, key: KeyObject, nowMs: number = Date.now()): string {
  const now = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - JWT_BACKDATE_S, exp: now + JWT_TTL_S, iss: appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${b64url(signer.sign(key))}`;
}

export type InstallationToken = { token: string; expiresAtMs: number; permissions: Record<string, string>; repositorySelection: string | null };

async function exchange(config: GitHubAppConfig): Promise<InstallationToken> {
  const key = loadPrivateKey(config);
  const jwt = mintAppJwt(config.appId, key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let response: Response;
  const idTag = `app sha16=${sha16(config.appId)}, installation sha16=${sha16(config.installationId)}`;
  try {
    response = await fetch(`${apiBase()}/app/installations/${config.installationId}/access_tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "memoryos-eng-mcp (github-app-auth)" },
      signal: controller.signal,
      redirect: "error"
    });
  } catch (error) {
    if (controller.signal.aborted) throw new GitHubAppAuthError("GITHUB_APP_TIMEOUT", `token exchange did not answer within ${timeoutMs()}ms (${idTag})`);
    throw new GitHubAppAuthError("GITHUB_APP_UNREACHABLE", `${error instanceof Error ? error.message : String(error)} (${idTag})`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body: unknown = null;
  try { body = text.length > 0 ? JSON.parse(text) : null; } catch { body = null; }
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  if (response.status !== 201 && response.status !== 200) {
    const message = typeof record.message === "string" ? record.message : "(no message)";
    const code = response.status === 401 ? "GITHUB_APP_AUTH_REJECTED" : response.status === 404 ? "GITHUB_APP_INSTALLATION_NOT_FOUND" : response.status === 403 ? "GITHUB_APP_FORBIDDEN" : "GITHUB_APP_TOKEN_EXCHANGE_FAILED";
    throw new GitHubAppAuthError(code, `HTTP ${response.status}: ${message} (${idTag})`);
  }
  const token = typeof record.token === "string" ? record.token : "";
  const expiresAtMs = typeof record.expires_at === "string" ? Date.parse(record.expires_at) : NaN;
  if (token.length === 0 || !Number.isFinite(expiresAtMs)) throw new GitHubAppAuthError("GITHUB_APP_OUTPUT_INVALID", `exchange answered without token/expires_at (${idTag})`);
  const permissions: Record<string, string> = {};
  if (typeof record.permissions === "object" && record.permissions !== null) {
    for (const [name, level] of Object.entries(record.permissions as Record<string, unknown>)) if (typeof level === "string") permissions[name] = level;
  }
  return { token, expiresAtMs, permissions, repositorySelection: typeof record.repository_selection === "string" ? record.repository_selection : null };
}

let cached: { key: string; value: InstallationToken } | null = null;
let inFlight: { key: string; promise: Promise<InstallationToken> } | null = null;

function cacheKey(config: GitHubAppConfig): string {
  return `${config.appId}:${config.installationId}:${config.privateKeyFile}`;
}

export async function getInstallationToken(config: GitHubAppConfig, nowMs: () => number = Date.now): Promise<InstallationToken> {
  const key = cacheKey(config);
  if (cached && cached.key === key && cached.value.expiresAtMs - nowMs() > REFRESH_MARGIN_MS) return cached.value;
  if (inFlight && inFlight.key === key) return inFlight.promise;
  const promise = exchange(config).then((value) => { cached = { key, value }; return value; }).finally(() => { if (inFlight?.promise === promise) inFlight = null; });
  inFlight = { key, promise };
  return promise;
}

// Drop the cached token (e.g. GitHub answered 401 to it) so the next call mints.
export function invalidateInstallationToken(): void {
  cached = null;
}

export type GithubAuth = { token: string; mode: "app" | "pat" };

export async function resolveGithubAuth(patFallback: () => string): Promise<GithubAuth> {
  const config = readGitHubAppConfig();
  if (config === null) return { token: patFallback(), mode: "pat" };
  const installation = await getInstallationToken(config);
  return { token: installation.token, mode: "app" };
}

export function __resetGithubAppAuthStateForTests(): void {
  cached = null;
  inFlight = null;
}
