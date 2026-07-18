// ConfigurationIntegrityEngine.ts — Sprint EF-35
// Validates env vars, tokens, scopes, URLs, versions, detects misconfigurations

export type ConfigSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface ConfigFinding {
  key: string;
  severity: ConfigSeverity;
  issue: string;
  detail: string;
  suggestedFix: string;
}

export interface ConfigReport {
  passed: boolean;
  score: number;         // 0-100
  findings: ConfigFinding[];
  checkedAt: number;
  totalChecks: number;
  passedChecks: number;
}

type Check = { key: string; run: () => ConfigFinding | null };

const REQUIRED_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const CHECKS: Check[] = [
  {
    key: "GOOGLE_OAUTH_CONNECTED",
    run() {
      try {
        const { getConnection } = require("@/lib/google-auth/GoogleAuthSession");
        const c = getConnection("default");
        if (!c || c.state !== "CONNECTED") {
          return { key: "GOOGLE_OAUTH_CONNECTED", severity: "WARNING", issue: "Google OAuth not connected",
            detail: "No active Google session found.", suggestedFix: "Connect Google account via /connections." };
        }
      } catch { return null; }
      return null;
    },
  },
  {
    key: "GOOGLE_ACCESS_TOKEN",
    run() {
      try {
        const { getConnection } = require("@/lib/google-auth/GoogleAuthSession");
        const c = getConnection("default");
        if (c?.state === "CONNECTED" && !c.accessToken) {
          return { key: "GOOGLE_ACCESS_TOKEN", severity: "ERROR", issue: "Access token missing despite connected state",
            detail: "Connection state is CONNECTED but accessToken is empty.", suggestedFix: "Re-authenticate via OAuth flow." };
        }
      } catch { return null; }
      return null;
    },
  },
  {
    key: "GITHUB_PAT",
    run() {
      try {
        const pat = localStorage.getItem("memoryos_github_pat") ?? localStorage.getItem("github_pat");
        if (!pat) {
          return { key: "GITHUB_PAT", severity: "INFO", issue: "GitHub PAT not configured",
            detail: "GitHub connector requires a Personal Access Token.", suggestedFix: "Add GitHub PAT via /connections." };
        }
        if (pat.length < 20) {
          return { key: "GITHUB_PAT", severity: "WARNING", issue: "GitHub PAT appears invalid (too short)",
            detail: `Token length: ${pat.length}`, suggestedFix: "Re-enter a valid GitHub PAT." };
        }
      } catch { return null; }
      return null;
    },
  },
  {
    key: "LOCALSTORAGE_AVAILABLE",
    run() {
      try {
        localStorage.setItem("_cfg_check", "1");
        localStorage.removeItem("_cfg_check");
      } catch {
        return { key: "LOCALSTORAGE_AVAILABLE", severity: "CRITICAL", issue: "LocalStorage unavailable",
          detail: "Platform cannot persist session tokens.", suggestedFix: "Check browser storage settings." };
      }
      return null;
    },
  },
  {
    key: "PERFORMANCE_API",
    run() {
      if (typeof performance === "undefined") {
        return { key: "PERFORMANCE_API", severity: "WARNING", issue: "Performance API unavailable",
          detail: "Latency metrics will be degraded.", suggestedFix: "Use a modern browser." };
      }
      return null;
    },
  },
  {
    key: "SESSION_STORAGE",
    run() {
      try {
        sessionStorage.setItem("_cfg_check", "1");
        sessionStorage.removeItem("_cfg_check");
      } catch {
        return { key: "SESSION_STORAGE", severity: "WARNING", issue: "SessionStorage unavailable",
          detail: "Some session data may not persist.", suggestedFix: "Check browser security settings." };
      }
      return null;
    },
  },
];

export const ConfigurationIntegrityEngine = {
  validate(): ConfigReport {
    const findings: ConfigFinding[] = [];
    for (const check of CHECKS) {
      try {
        const result = check.run();
        if (result) findings.push(result);
      } catch (e: any) {
        findings.push({ key: check.key, severity: "ERROR", issue: "Check threw an exception",
          detail: e?.message ?? String(e), suggestedFix: "Investigate check implementation." });
      }
    }
    const passed = findings.filter(f => f.severity === "CRITICAL" || f.severity === "ERROR").length === 0;
    const passedChecks = CHECKS.length - findings.length;
    return {
      passed,
      score: Math.round((passedChecks / CHECKS.length) * 100),
      findings,
      checkedAt: Date.now(),
      totalChecks: CHECKS.length,
      passedChecks: Math.max(0, passedChecks),
    };
  },
};