// GIT-PUSH-APP-AUTH-01: shared credential-SOURCE resolution for the git tools
// that touch the remote (git.push, git.fetch — git.merge is purely local and
// never resolves a credential). The primary source is the GitHub App
// installation token (self-rotating, minted through githubAppAuth with its own
// module cache — reuse while more than REFRESH_MARGIN_MS of life remains, so a
// ~1h token is reused for ~55min); the operator credential-store FILE is the
// fallback ONLY when the App is not configured at all and the mode allows it.
// The mode comes from ENG_MCP_GIT_CRED_MODE (app-only | app-with-fallback |
// pat-only; default app-with-fallback until the operator revokes the PAT and
// switches the deployment to app-only). A PAT fallback is NEVER silent: the
// resolution carries the typed warning github_app_fallback_pat and the callers
// write it (plus credSource) to their audit trail.
// The installation token never reaches argv, env or logs: it is materialized as
// a 0600 credential-store entry in a 0700 private temp dir consumed through the
// existing `credential.helper= --file=` chain and unlinked right after the git
// call — the same transient-disk posture as the mounted credential file itself,
// with a strictly shorter lifetime.
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getInstallationToken, readGitHubAppConfig, scrubGitHubAppSecrets, type GitHubAppConfig } from "./githubAppAuth.ts";

export const CRED_MODE_ENV = "ENG_MCP_GIT_CRED_MODE";
export const PAT_WARNING = "github_app_fallback_pat" as const;
const CREDENTIAL_FILE_DEFAULT = "/run/secrets/git-credentials";
const TEMP_DIR_PREFIX = "eng-mcp-git-cred-";

export type GitCredMode = "app-only" | "app-with-fallback" | "pat-only";
export type GitCredSource = "github-app" | "pat-fallback";
export type PatWarning = typeof PAT_WARNING | null;

export class GitCredSourceError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}:${scrubGitHubAppSecrets(detail)}` : code);
    this.name = "GitCredSourceError";
  }
}

// Invalid mode is fail-closed: an operator who set the variable meant a mode.
export function resolveGitCredMode(env: NodeJS.ProcessEnv = process.env): GitCredMode {
  const raw = (env[CRED_MODE_ENV] ?? "").trim();
  if (raw === "") return "app-with-fallback";
  if (raw === "app-only" || raw === "app-with-fallback" || raw === "pat-only") return raw;
  throw new GitCredSourceError("GIT_CRED_MODE_INVALID", `${CRED_MODE_ENV} must be app-only|app-with-fallback|pat-only, got ${JSON.stringify(raw.slice(0, 24))}`);
}

export type GitCredPlan = { mode: GitCredMode; source: GitCredSource | null; appConfigured: boolean; warning: PatWarning };

// PLAN-side decision: NO token exchange happens here (stays side-effect-light —
// the plan never mints). source null = app-only with no App config (the caller
// reports the blocker). A partial/malformed App config throws fail-closed — an
// operator who set one ID meant App mode and must never degrade silently.
export function planGitCredential(env: NodeJS.ProcessEnv = process.env): GitCredPlan {
  const mode = resolveGitCredMode(env);
  let config: GitHubAppConfig | null = null;
  try { config = readGitHubAppConfig(env); } catch (error) {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "GITHUB_APP_CONFIG_INVALID";
    throw new GitCredSourceError(code, error instanceof Error ? error.message : String(error));
  }
  if (mode === "pat-only") return { mode, source: "pat-fallback", appConfigured: config !== null, warning: null };
  if (config !== null) return { mode, source: "github-app", appConfigured: true, warning: null };
  if (mode === "app-only") return { mode, source: null, appConfigured: false, warning: null };
  return { mode, source: "pat-fallback", appConfigured: false, warning: PAT_WARNING };
}

// credential-store path for the PAT fallback (caller stats it — the module never
// reads credential content, matching the git.push/git.fetch contract). patPath
// overrides the env/default resolution — it is the caller's already-resolved
// path (deps.credentialFile ?? GIT_CREDENTIALS_FILE ?? default).
export function resolvePatCredentialPath(patPath?: string | null, env: NodeJS.ProcessEnv = process.env): string {
  if (patPath !== undefined && patPath !== null && patPath !== "") return patPath;
  return env.GIT_CREDENTIALS_FILE?.trim() ? env.GIT_CREDENTIALS_FILE.trim() : CREDENTIAL_FILE_DEFAULT;
}

export type GitCredentialResolution = {
  credSource: GitCredSource;
  helperFile: string;
  expiresAtMs?: number;
  warning: PatWarning;
  // No-op for the PAT path (the file is the operator's mount — never removed).
  cleanup: () => void;
};

// EXECUTE-side resolution: mints (or reuses the cached) installation token for
// the App path, or returns the credential-store path for the PAT path — the
// caller stats the PAT path itself (typed missing-credential errors are the
// caller's domain). originUrl (from `git remote get-url origin`, never surfaced
// in reports/logs) only shapes the credential-store entry so it matches the
// remote exactly; null/ssh remotes degrade to the generic github.com entry
// (App tokens are GitHub-only; ssh remotes never consult the credential helper).
export async function resolveGitCredential(mode: GitCredMode, originUrl: string | null, patPath?: string | null): Promise<GitCredentialResolution> {
  if (mode !== "pat-only") {
    let config: GitHubAppConfig | null;
    try { config = readGitHubAppConfig(); } catch (error) {
      const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "GITHUB_APP_CONFIG_INVALID";
      throw new GitCredSourceError(code, error instanceof Error ? error.message : String(error));
    }
    if (config !== null) {
      const installation = await getInstallationToken(config);
      return materializeTokenCredentialFile(originUrl, installation.token, installation.expiresAtMs);
    }
    if (mode === "app-only") {
      throw new GitCredSourceError("GIT_CRED_MODE_NO_APP", `${CRED_MODE_ENV}=app-only requires the GitHub App config (GITHUB_APP_ID + GITHUB_INSTALLATION_ID) — the PAT fallback is disabled by the mode`);
    }
  }
  return { credSource: "pat-fallback", helperFile: resolvePatCredentialPath(patPath), warning: mode === "app-with-fallback" ? PAT_WARNING : null, cleanup: () => {} };
}

function credentialEntry(originUrl: string | null, token: string): string {
  if (originUrl) {
    try {
      const url = new URL(originUrl);
      if (url.protocol === "https:") {
        // GitHub matches a credential-store entry against the REQUEST's username,
        // and that username comes from the remote URL itself (e.g. a remote of the
        // form https://user@github.com/... makes git ask for that user) — replacing
        // it makes git prompt and fail ("could not read Password"). So the entry
        // keeps the remote's own username and the token rides as the password.
        if (!url.username) url.username = "x-access-token";
        url.password = token;
        return url.toString();
      }
    } catch { /* ssh-scp-like origin (git@host:path) — fall through to the generic entry */ }
  }
  return `https://x-access-token:${token}@github.com`;
}

function materializeTokenCredentialFile(originUrl: string | null, token: string, expiresAtMs: number): GitCredentialResolution {
  const dir = path.join(tmpdir(), `${TEMP_DIR_PREFIX}${randomUUID()}`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, "git-credentials");
    writeFileSync(file, `${credentialEntry(originUrl, token)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(file, 0o600); // umask-proof: the file must be owner-only even on permissive umasks
    try { statSync(file); } catch { throw new GitCredSourceError("GIT_CRED_MATERIALIZE_FAILED", "installation-token credential file did not materialize"); }
    return {
      credSource: "github-app", helperFile: file, expiresAtMs, warning: null,
      cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } },
    };
  } catch (error) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    if (error instanceof GitCredSourceError) throw error;
    throw new GitCredSourceError("GIT_CRED_MATERIALIZE_FAILED", error instanceof Error ? error.message : String(error));
  }
}
