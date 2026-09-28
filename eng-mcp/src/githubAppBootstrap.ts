// GITHUB-APP-BOOTSTRAP-01: GitHub App Manifest flow — reduces the operator's
// part of creating the App to 1 click + 1 code.
//
// GitHub's manifest flow is a form POST (field `manifest`, JSON string) to
// https://github.com/settings/apps/new?state=<csrf>. A plain GET link cannot
// carry the manifest, so the launcher is a tiny self-submitting HTML page
// (delivered as a file and as a data: URL). After "Create GitHub App" GitHub
// redirects to redirect_url?code=...&state=... — the redirect_url is loopback
// with nothing listening, so the browser shows an error page and the one-time
// code sits in the address bar for the operator to copy. The code is valid for
// 1 hour and is exchanged ONCE at POST /app-manifests/{code}/conversions.
//
// Permissions are read-only by construction: buildGitHubAppManifest refuses any
// permission level other than "read" and webhooks are always inactive.
// The conversion (convertManifestCode) returns the PEM to the caller only as an
// opaque value to be written 0600 by the host script — it is never logged; the
// summary it exposes carries app id/slug/owner + PEM sha16, nothing secret.
import { createHash, randomBytes } from "node:crypto";

export const GITHUB_APP_READ_ONLY_PERMISSIONS: Readonly<Record<string, "read">> = Object.freeze({
  contents: "read",
  metadata: "read",
  // Kept read-only so the 10 engineering.github.read operations keep working
  // once the App takes precedence over the PAT (get_pr, list_action_runs,
  // checks inside get_pr). No write permission exists in this manifest.
  pull_requests: "read",
  actions: "read",
  checks: "read"
});

export const DEFAULT_BOOTSTRAP_REDIRECT_URL = "http://127.0.0.1:65535/github-app-manifest-callback";
export const DEFAULT_BOOTSTRAP_REPO = "AndersonVitaease/memoryos";

export class GitHubAppBootstrapError extends Error {
  readonly code: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}:${scrubBootstrap(detail)}` : code);
    this.code = code;
    this.name = "GitHubAppBootstrapError";
  }
}

function scrubBootstrap(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[REDACTED_SECRET]")
    .replace(/"(pem|client_secret|webhook_secret|client_id)"\s*:\s*"[^"]*"/g, '"$1":"[REDACTED_SECRET]"')
    .replace(/gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}/g, "[REDACTED_SECRET]")
    .slice(0, 500);
}

export interface ManifestOptions {
  name: string;
  repo?: string;
  redirectUrl?: string;
  permissions?: Record<string, string>;
}

export interface GitHubAppManifest {
  name: string;
  url: string;
  description: string;
  public: false;
  redirect_url: string;
  hook_attributes: { url: string; active: false };
  default_permissions: Record<string, "read">;
  default_events: [];
  request_oauth_on_install: false;
}

function isLoopbackHttp(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]");
  } catch { return false; }
}

export function buildGitHubAppManifest(opts: ManifestOptions): GitHubAppManifest {
  const name = opts.name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,33}$/.test(name)) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_INVALID_NAME");
  const repo = opts.repo ?? DEFAULT_BOOTSTRAP_REPO;
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_INVALID_REPO");
  const redirectUrl = opts.redirectUrl ?? DEFAULT_BOOTSTRAP_REDIRECT_URL;
  if (!isLoopbackHttp(redirectUrl)) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_REDIRECT_NOT_LOOPBACK");
  const requested = opts.permissions ?? GITHUB_APP_READ_ONLY_PERMISSIONS;
  const permissions: Record<string, "read"> = {};
  for (const [key, level] of Object.entries(requested)) {
    if (level !== "read") throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_WRITE_PERMISSION_REFUSED", key);
    permissions[key] = "read";
  }
  if (permissions.metadata !== "read" || permissions.contents !== "read") throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_MINIMUM_PERMISSIONS");
  const url = `https://github.com/${repo}`;
  return {
    name,
    url,
    description: "MemoryOS eng-mcp read-only GitHub access (installation token, self-rotating).",
    public: false,
    redirect_url: redirectUrl,
    hook_attributes: { url, active: false },
    default_permissions: permissions,
    default_events: [],
    request_oauth_on_install: false
  };
}

function htmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface BootstrapLaunch {
  manifest: GitHubAppManifest;
  state: string;
  stateSha16: string;
  formAction: string;
  html: string;
  dataUrl: string;
  manifestSha16: string;
  expiresNote: string;
}

export function buildBootstrapLaunch(opts: ManifestOptions & { state?: string }): BootstrapLaunch {
  const manifest = buildGitHubAppManifest(opts);
  const state = opts.state ?? randomBytes(16).toString("hex");
  if (!/^[A-Za-z0-9]{16,64}$/.test(state)) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_INVALID_STATE");
  const formAction = `https://github.com/settings/apps/new?state=${state}`;
  const manifestJson = JSON.stringify(manifest);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Create GitHub App (manifest)</title></head><body>`
    + `<form id="f" method="post" action="${htmlAttr(formAction)}">`
    + `<input type="hidden" name="manifest" value="${htmlAttr(manifestJson)}">`
    + `<p>Criando o GitHub App <b>${htmlAttr(manifest.name)}</b> (somente leitura)...</p>`
    + `<button type="submit">Continuar no GitHub</button></form>`
    + `<script>document.getElementById("f").submit()</script></body></html>`;
  return {
    manifest,
    state,
    stateSha16: sha16(state),
    formAction,
    html,
    dataUrl: `data:text/html;base64,${Buffer.from(html, "utf8").toString("base64")}`,
    manifestSha16: sha16(manifestJson),
    expiresNote: "Após clicar Create GitHub App, o code na barra de endereço vale 1 hora e só pode ser trocado uma vez."
  };
}

export function sha16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** Extracts the one-time code from a pasted redirect URL or bare code; validates state when given. */
export function parseManifestCode(input: string, expectedState?: string): string {
  const raw = input.trim();
  let code = raw;
  let state: string | null = null;
  if (/^https?:\/\//.test(raw)) {
    try {
      const u = new URL(raw);
      code = u.searchParams.get("code") ?? "";
      state = u.searchParams.get("state");
    } catch { throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_CODE_INVALID"); }
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(code)) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_CODE_INVALID");
  if (expectedState && state !== null && state !== expectedState) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_STATE_MISMATCH");
  return code;
}

export interface ManifestConversion {
  appId: number;
  slug: string;
  owner: string;
  pem: string; // secret — caller writes it 0600, never logs it
  permissions: Record<string, string>;
  htmlUrl: string;
}

export function conversionSummary(c: ManifestConversion): Record<string, unknown> {
  return { appId: c.appId, slug: c.slug, owner: c.owner, permissions: c.permissions, htmlUrl: c.htmlUrl, pemSha16: sha16(c.pem) };
}

function apiBase(): string {
  const override = process.env.ENG_MCP_GITHUB_APP_API_BASE;
  if (!override) return "https://api.github.com";
  if (override.startsWith("https://") || isLoopbackHttp(override)) return override.replace(/\/$/, "");
  throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_API_BASE_REFUSED");
}

export async function convertManifestCode(code: string, fetchImpl: typeof fetch = fetch): Promise<ManifestConversion> {
  const safeCode = parseManifestCode(code);
  let res: Response;
  try {
    res = await fetchImpl(`${apiBase()}/app-manifests/${safeCode}/conversions`, {
      method: "POST",
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "memoryos-eng-mcp" },
      signal: AbortSignal.timeout(15_000)
    });
  } catch (e) {
    throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_UNREACHABLE", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text();
  if (res.status === 404 || res.status === 422) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_CODE_EXPIRED_OR_USED", `status=${res.status}`);
  if (!res.ok) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_CONVERSION_FAILED", `status=${res.status} ${text}`);
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_CONVERSION_FAILED", "non-json"); }
  const pem = typeof body.pem === "string" ? body.pem : "";
  const appId = typeof body.id === "number" ? body.id : Number(body.id);
  if (!pem.includes("PRIVATE KEY") || !Number.isInteger(appId) || appId <= 0) throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_CONVERSION_FAILED", "missing id/pem");
  const owner = (body.owner as { login?: string } | undefined)?.login ?? "";
  const perms = (body.permissions as Record<string, string> | undefined) ?? {};
  for (const [k, v] of Object.entries(perms)) {
    if (v !== "read") throw new GitHubAppBootstrapError("GITHUB_APP_BOOTSTRAP_WRITE_PERMISSION_REFUSED", `converted app has ${k}=${v}`);
  }
  return { appId, slug: String(body.slug ?? ""), owner, pem, permissions: perms, htmlUrl: String(body.html_url ?? "") };
}
