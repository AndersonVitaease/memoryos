/**
 * GitHubTokenManager — Phase 5.3 Authentication Configuration
 * Resolves GitHub PAT from multiple sources with explicit diagnostics.
 *
 * Resolution order:
 *   1. globalThis.__GITHUB_TOKEN__ (browser runtime / test injection)
 *   2. sessionStorage["github_token"]
 *   3. localStorage["github_token"]
 *   4. import.meta.env.VITE_GITHUB_TOKEN (Vite build-time)
 */

export type TokenSource = "runtime" | "sessionStorage" | "localStorage" | "env" | "none";

export interface TokenResolution {
  readonly token: string | null;
  readonly source: TokenSource;
  readonly resolvedAt: number;
}

export type TokenValidationState =
  | "VALID"
  | "MISSING"
  | "EXPIRED"
  | "INVALID"
  | "INSUFFICIENT_PERMISSIONS";

export interface TokenDiagnostic {
  readonly state: TokenValidationState;
  readonly source: TokenSource;
  readonly login: string | null;
  readonly scopes: string | null;
  readonly rateLimit: { remaining: number; limit: number; resetAt: string } | null;
  readonly latencyMs: number;
  readonly checkedAt: number;
  readonly detail: string;
  readonly recoveryPlan: RecoveryPlan | null;
}

export interface RecoveryStep {
  readonly step: number;
  readonly action: string;
  readonly detail: string;
}

export interface RecoveryPlan {
  readonly cause: string;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM";
  readonly steps: RecoveryStep[];
}

const RECOVERY_PLANS: Record<string, RecoveryPlan> = {
  MISSING: {
    cause: "GitHub Personal Access Token not configured",
    severity: "CRITICAL",
    steps: [
      { step: 1, action: "Generate a PAT", detail: "Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token" },
      { step: 2, action: "Select required scopes", detail: "Required scopes: 'repo' (full control of private repos) + 'read:user' (read all user profile data)" },
      { step: 3, action: "Configure via browser console", detail: "Open DevTools → Console → type: globalThis.__GITHUB_TOKEN__ = '<your_token_here>'" },
      { step: 4, action: "Configure via Session Storage", detail: "Alternatively: sessionStorage.setItem('github_token', '<your_token_here>')" },
      { step: 5, action: "Reload and re-run audit", detail: "Refresh the page and click 'Run Operational Audit' to validate" },
    ],
  },
  INVALID: {
    cause: "GitHub token is present but rejected by the API (401 Unauthorized)",
    severity: "CRITICAL",
    steps: [
      { step: 1, action: "Verify token value", detail: "Ensure the token was copied in full without leading/trailing spaces or line breaks" },
      { step: 2, action: "Check token expiry", detail: "Go to GitHub → Settings → Developer settings → Personal access tokens — verify the token has not expired" },
      { step: 3, action: "Regenerate if expired", detail: "Click the token name → Regenerate token → Update the configured value" },
      { step: 4, action: "Re-inject the token", detail: "Run: globalThis.__GITHUB_TOKEN__ = '<new_token>' in browser console" },
    ],
  },
  EXPIRED: {
    cause: "GitHub token has expired",
    severity: "HIGH",
    steps: [
      { step: 1, action: "Navigate to GitHub token settings", detail: "Go to github.com → Settings → Developer settings → Personal access tokens" },
      { step: 2, action: "Find the expired token", detail: "Locate the token marked as expired — tokens show expiry date in the list" },
      { step: 3, action: "Regenerate or create new token", detail: "Click Regenerate → set new expiry → copy the new value immediately" },
      { step: 4, action: "Update runtime configuration", detail: "Run: globalThis.__GITHUB_TOKEN__ = '<new_token>' in browser console" },
    ],
  },
  INSUFFICIENT_PERMISSIONS: {
    cause: "GitHub token exists and is valid, but lacks required scopes",
    severity: "HIGH",
    steps: [
      { step: 1, action: "Identify missing scopes", detail: "Required: 'repo' scope for repository access, 'read:user' scope for user profile" },
      { step: 2, action: "Edit existing token", detail: "Go to GitHub → Settings → Developer settings → Personal access tokens → select the token → Edit" },
      { step: 3, action: "Add missing scopes", detail: "Enable 'repo' checkbox (includes repo:status, repo_deployment, public_repo, repo:invite) and 'read:user'" },
      { step: 4, action: "Save and re-inject", detail: "Save token → re-copy value → run: globalThis.__GITHUB_TOKEN__ = '<token>' in console" },
    ],
  },
};

export class GitHubTokenManager {

  resolve(): TokenResolution {
    const now = Date.now();
    const g = globalThis as any;

    // 1. Runtime injection
    if (g.__GITHUB_TOKEN__ && typeof g.__GITHUB_TOKEN__ === "string" && g.__GITHUB_TOKEN__.trim().length > 0) {
      return { token: g.__GITHUB_TOKEN__.trim(), source: "runtime", resolvedAt: now };
    }

    // 2. sessionStorage
    try {
      const ss = sessionStorage.getItem("github_token");
      if (ss && ss.trim().length > 0) {
        return { token: ss.trim(), source: "sessionStorage", resolvedAt: now };
      }
    } catch { /* unavailable */ }

    // 3. localStorage
    try {
      const ls = localStorage.getItem("github_token");
      if (ls && ls.trim().length > 0) {
        return { token: ls.trim(), source: "localStorage", resolvedAt: now };
      }
    } catch { /* unavailable */ }

    // 4. Vite env
    try {
      const viteEnv = (import.meta as any)?.env?.VITE_GITHUB_TOKEN;
      if (viteEnv && typeof viteEnv === "string" && viteEnv.trim().length > 0) {
        return { token: viteEnv.trim(), source: "env", resolvedAt: now };
      }
    } catch { /* unavailable */ }

    return { token: null, source: "none", resolvedAt: now };
  }

  inject(token: string, target: "runtime" | "sessionStorage" | "localStorage" = "runtime"): void {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("Token must not be empty");
    if (target === "runtime") {
      (globalThis as any).__GITHUB_TOKEN__ = trimmed;
    } else if (target === "sessionStorage") {
      sessionStorage.setItem("github_token", trimmed);
    } else {
      localStorage.setItem("github_token", trimmed);
    }
  }

  clear(): void {
    delete (globalThis as any).__GITHUB_TOKEN__;
    try { sessionStorage.removeItem("github_token"); } catch {}
    try { localStorage.removeItem("github_token"); } catch {}
  }

  async diagnose(): Promise<TokenDiagnostic> {
    const t0 = Date.now();
    const resolution = this.resolve();

    if (!resolution.token) {
      return {
        state: "MISSING", source: "none", login: null, scopes: null,
        rateLimit: null, latencyMs: Date.now() - t0, checkedAt: t0,
        detail: "No GitHub token found in any configured source (runtime, sessionStorage, localStorage, env)",
        recoveryPlan: RECOVERY_PLANS.MISSING,
      };
    }

    // Validate against GitHub API
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${resolution.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(8000),
      });

      const latencyMs = Date.now() - t0;
      const scopeHeader = res.headers.get("x-oauth-scopes");
      const rateLimitRemaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "0", 10);
      const rateLimitLimit = parseInt(res.headers.get("x-ratelimit-limit") ?? "60", 10);
      const rateLimitReset = res.headers.get("x-ratelimit-reset");
      const resetAt = rateLimitReset ? new Date(parseInt(rateLimitReset, 10) * 1000).toISOString() : "unknown";

      if (res.status === 401) {
        return {
          state: "INVALID", source: resolution.source, login: null, scopes: null,
          rateLimit: null, latencyMs, checkedAt: t0,
          detail: `Token rejected by GitHub API — HTTP 401 (source: ${resolution.source})`,
          recoveryPlan: RECOVERY_PLANS.INVALID,
        };
      }

      if (res.status === 403) {
        return {
          state: "INSUFFICIENT_PERMISSIONS", source: resolution.source, login: null, scopes: scopeHeader,
          rateLimit: { remaining: rateLimitRemaining, limit: rateLimitLimit, resetAt },
          latencyMs, checkedAt: t0,
          detail: `Token valid but forbidden — HTTP 403. Scopes: ${scopeHeader ?? "none"}`,
          recoveryPlan: RECOVERY_PLANS.INSUFFICIENT_PERMISSIONS,
        };
      }

      if (!res.ok) {
        return {
          state: "INVALID", source: resolution.source, login: null, scopes: null,
          rateLimit: null, latencyMs, checkedAt: t0,
          detail: `Unexpected HTTP ${res.status} from GitHub API`,
          recoveryPlan: RECOVERY_PLANS.INVALID,
        };
      }

      const user = await res.json();
      const login = user?.login ?? null;
      const rateLimit = { remaining: rateLimitRemaining, limit: rateLimitLimit, resetAt };

      // Check required scopes (classic PATs return x-oauth-scopes header)
      const scopeList = scopeHeader ? scopeHeader.split(",").map(s => s.trim()) : [];
      const hasRepo = scopeHeader === null || scopeList.includes("repo") || scopeList.includes("public_repo");
      const hasReadUser = scopeHeader === null || scopeList.includes("read:user") || scopeList.includes("user");

      if (scopeHeader !== null && (!hasRepo || !hasReadUser)) {
        return {
          state: "INSUFFICIENT_PERMISSIONS", source: resolution.source, login, scopes: scopeHeader,
          rateLimit, latencyMs, checkedAt: t0,
          detail: `Token authenticated as ${login} but missing scopes. Has: [${scopeHeader}]. Needs: repo, read:user`,
          recoveryPlan: RECOVERY_PLANS.INSUFFICIENT_PERMISSIONS,
        };
      }

      return {
        state: "VALID", source: resolution.source, login, scopes: scopeHeader ?? "fine-grained (no header)",
        rateLimit, latencyMs, checkedAt: t0,
        detail: `Token valid — authenticated as ${login} — source: ${resolution.source} — ${latencyMs}ms`,
        recoveryPlan: null,
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("timeout") || msg.includes("abort");
      return {
        state: "INVALID", source: resolution.source, login: null, scopes: null,
        rateLimit: null, latencyMs: Date.now() - t0, checkedAt: t0,
        detail: isTimeout ? "GitHub API request timed out (>8s)" : `Network error: ${msg}`,
        recoveryPlan: RECOVERY_PLANS.INVALID,
      };
    }
  }

  getRecoveryPlan(state: TokenValidationState): RecoveryPlan | null {
    return RECOVERY_PLANS[state] ?? null;
  }
}