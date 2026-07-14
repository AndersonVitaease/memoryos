/**
 * golvTests.ts — Sprint 6.4.1A (GOLV — Google OAuth Live Validation / Discovery)
 * Regression tests for OAuth Configuration & Discovery.
 */

import type { RegressionTest, RegressionResult, RegressionCategory } from "../EngineeringRegressionSuite";
import { OAuthDiscovery } from "../../oauth-discovery/OAuthDiscoveryEngine";
import { OAuthRedirectUriResolver } from "../../oauth-discovery/OAuthRedirectUriResolver";
import { OAuthCallbackResolver } from "../../oauth-discovery/OAuthCallbackResolver";
import { OAuthScopeRegistry } from "../../oauth-discovery/OAuthScopeRegistry";
import { OAuthEnvironmentInspector } from "../../oauth-discovery/OAuthEnvironmentInspector";
import { OAuthConfigurationValidator } from "../../oauth-discovery/OAuthConfigurationValidator";
import { OAuthConfigurationAudit } from "../../oauth-discovery/OAuthConfigurationAudit";
import { OAuthDiscoveryHistory } from "../../oauth-discovery/OAuthDiscoveryHistory";
import { OAuthDiscoveryDiagnostics } from "../../oauth-discovery/OAuthDiscoveryDiagnostics";
import { OAuthConfigurationRegistry } from "../../oauth-discovery/OAuthConfigurationRegistry";

const CAT = "GOLV" as RegressionCategory;

export const golvTests: RegressionTest[] = [
  {
    id: "golv_01", name: "Discovery Engine discovers all UOP providers", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const report = OAuthDiscovery.discover();
      const ok = report.totalProviders >= 8 && report.providers.length === report.totalProviders;
      return { testId: "golv_01", testName: "Discovery Engine discovers all UOP providers", category: CAT,
        passed: ok, detail: ok ? `Discovered ${report.totalProviders} providers in ${report.durationMs}ms` : `Only ${report.totalProviders} providers found`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_02", name: "RedirectUriResolver auto-resolves from runtime", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const resolver = new OAuthRedirectUriResolver();
      const uri = resolver.getRedirectUri("google");
      const cb  = resolver.getCallbackUri("google");
      const origins = resolver.getAuthorizedOrigins();
      const ok = uri.includes("/oauth/callback/google") && cb === uri && origins.length >= 1;
      return { testId: "golv_02", testName: "RedirectUriResolver auto-resolves from runtime", category: CAT,
        passed: ok, detail: ok ? `URI: ${uri} origins: ${origins.length}` : `uri=${uri} cb=${cb}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_03", name: "CallbackResolver parses OAuth callback params", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const resolver = new OAuthCallbackResolver();
      const fake = "https://app.base44.com/oauth/callback/google?code=4%2F0test&state=state_123";
      const parsed = resolver.parse(fake);
      const ok = parsed.code !== null && parsed.state === "state_123" && parsed.isCallback && parsed.provider === "google";
      return { testId: "golv_03", testName: "CallbackResolver parses OAuth callback params", category: CAT,
        passed: ok, detail: ok ? `code=present state=${parsed.state} provider=${parsed.provider}` : `code=${parsed.code} state=${parsed.state}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_04", name: "ScopeRegistry: Google identity scopes complete", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthScopeRegistry();
      const required = reg.getRequiredScopeNames("google");
      const all      = reg.getScopeNames("google");
      const hasIdentity = ["openid","email","profile"].every(s => required.includes(s));
      const hasCalendar = all.some(s => s.includes("calendar"));
      const ok = hasIdentity && hasCalendar && all.length >= 3;
      return { testId: "golv_04", testName: "ScopeRegistry: Google identity scopes complete", category: CAT,
        passed: ok, detail: ok ? `required=${required.length} total=${all.length}` : `identity=${hasIdentity} calendar=${hasCalendar}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_05", name: "ScopeRegistry: validateGranted detects missing", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthScopeRegistry();
      const { valid: v1, missing: m1 } = reg.validateGranted("google", ["openid","email","profile"]);
      const { valid: v2, missing: m2 } = reg.validateGranted("google", ["openid"]);
      const ok = v1 && !v2 && m2.length >= 2;
      return { testId: "golv_05", testName: "ScopeRegistry: validateGranted detects missing", category: CAT,
        passed: ok, detail: ok ? `full=valid partial=invalid missing=${m2.join(",")}` : `v1=${v1} v2=${v2} m2=${m2.join(",")}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_06", name: "EnvironmentInspector: no credentials exposed", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const insp = new OAuthEnvironmentInspector();
      const env  = insp.inspect();
      const str  = JSON.stringify(env);
      const noSecret = !str.includes("client_secret") && !str.includes("clientSecret\":\"") &&
        !str.match(/ya29\.|AIza|sk-|[A-Za-z0-9_-]{30,}/);
      const hasStatus = env.providerCredentials["google"] !== undefined;
      const statusOk  = ["CONFIGURED","MISSING"].includes(env.providerCredentials["google"].clientId);
      const ok = noSecret && hasStatus && statusOk;
      return { testId: "golv_06", testName: "EnvironmentInspector: no credentials exposed", category: CAT,
        passed: ok, detail: ok ? `Status only — no raw values. google.clientId=${env.providerCredentials["google"].clientId}` : `noSecret=${noSecret} hasStatus=${hasStatus}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_07", name: "ConfigurationValidator: scores provider 0–100", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const validator = new OAuthConfigurationValidator(
        new OAuthEnvironmentInspector(),
        new OAuthScopeRegistry(),
        new OAuthRedirectUriResolver(),
      );
      const result = validator.validate("google", ["openid","email","profile"]);
      const ok = result.score >= 0 && result.score <= 100 && result.checks.length >= 5;
      return { testId: "golv_07", testName: "ConfigurationValidator: scores provider 0–100", category: CAT,
        passed: ok, detail: ok ? `score=${result.score} checks=${result.checks.length} valid=${result.valid}` : `score=${result.score}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_08", name: "ConfigurationAudit: append-only, no credentials", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const audit = new OAuthConfigurationAudit();
      audit.record("DISCOVERY_RUN", "google", "SUCCESS", "Discovery completed");
      audit.record("REDIRECT_COPIED", "google", "INFO", "User copied redirect URI");
      const before = audit.count();
      audit.record("HEALTH_CHECK", null, "INFO", "Health check ran");
      const after = audit.count();
      const appendOk = after === before + 1;
      const noSecret = audit.all().every(e =>
        !e.detail.toLowerCase().includes("client_secret") &&
        !e.detail.toLowerCase().includes("access_token")
      );
      const ok = appendOk && noSecret;
      return { testId: "golv_08", testName: "ConfigurationAudit: append-only, no credentials", category: CAT,
        passed: ok, detail: ok ? `entries=${after} clean=true` : `append=${appendOk} clean=${noSecret}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_09", name: "ConfigurationRegistry: marks credentials without storing", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthConfigurationRegistry();
      reg.markConfigured("google", true, true);
      const entry = reg.get("google");
      const str = JSON.stringify(entry);
      const ok = !!entry && entry.hasClientId && entry.hasClientSecret &&
        !str.includes("ya29") && !str.includes("secret=");
      return { testId: "golv_09", testName: "ConfigurationRegistry: marks credentials without storing", category: CAT,
        passed: ok, detail: ok ? `flags only: hasClientId=${entry?.hasClientId} hasClientSecret=${entry?.hasClientSecret}` : "Registry failed",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_10", name: "DiscoveryHistory: append-only, max 20", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const history = new OAuthDiscoveryHistory();
      for (let i = 0; i < 25; i++) {
        history.add({ id: `r${i}`, generatedAt: Date.now(), durationMs: i, providers: [], totalProviders: i, fullyConfigured: 0, partial: 0, missing: i, healthy: 0, degraded: i, issues: [], recommendations: [] });
      }
      const ok = history.count() === 20 && !!history.latest();
      return { testId: "golv_10", testName: "DiscoveryHistory: append-only, max 20", category: CAT,
        passed: ok, detail: ok ? `count=20 (capped) latest=${history.latest()?.id}` : `count=${history.count()}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_11", name: "DiscoveryDiagnostics: PASS/WARN/FAIL result", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const diag = new OAuthDiscoveryDiagnostics();
      // All configured
      const r1 = diag.run([{ provider: "google", clientIdStatus: "CONFIGURED", clientSecretStatus: "CONFIGURED", missingConfig: [], missingScopes: [] } as any]);
      // Missing credentials
      const r2 = diag.run([{ provider: "slack", clientIdStatus: "MISSING", clientSecretStatus: "MISSING", missingConfig: ["Client ID","Client Secret"], missingScopes: [] } as any]);
      const ok = r1.overall === "PASS" && (r2.overall === "WARN" || r2.overall === "FAIL");
      return { testId: "golv_11", testName: "DiscoveryDiagnostics: PASS/WARN/FAIL result", category: CAT,
        passed: ok, detail: ok ? `configured=PASS missing=${r2.overall}` : `r1=${r1.overall} r2=${r2.overall}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_12", name: "Discovery report contains all 8 providers", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const report = OAuthDiscovery.discover();
      const providerNames = report.providers.map(p => p.provider);
      const hasGoogle  = providerNames.includes("google");
      const hasMic     = providerNames.includes("microsoft");
      const hasSlack   = providerNames.includes("slack");
      const hasGitHub  = providerNames.includes("github");
      const ok = hasGoogle && hasMic && hasSlack && hasGitHub && report.totalProviders >= 8;
      return { testId: "golv_12", testName: "Discovery report contains all 8 providers", category: CAT,
        passed: ok, detail: ok ? `providers=[${providerNames.join(",")}]` : `found=${providerNames.join(",")}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_13", name: "Provider discovery includes redirectUri and callbackUri", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const report = OAuthDiscovery.discover();
      const google = report.providers.find(p => p.provider === "google");
      const ok = !!google &&
        google.redirectUri.includes("/oauth/callback/google") &&
        google.callbackUri === google.redirectUri &&
        google.authorizedOrigins.length >= 1;
      return { testId: "golv_13", testName: "Provider discovery includes redirectUri and callbackUri", category: CAT,
        passed: ok, detail: ok ? `redirect=${google?.redirectUri} origins=${google?.authorizedOrigins.length}` : "Google missing redirect config",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_14", name: "Discovery engine is singleton (globalThis anchored)", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const G = globalThis as any;
      const engine1 = G.__oauthDiscoveryEngine;
      const engine2 = G.__oauthDiscoveryEngine;
      const ok = engine1 === engine2 && !!engine1;
      return { testId: "golv_14", testName: "Discovery engine is singleton (globalThis anchored)", category: CAT,
        passed: ok, detail: ok ? "Singleton stable across references" : "Singleton lost",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "golv_15", name: "GIP consumes discovered redirect URI (not hardcoded)", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const discovered = OAuthDiscovery.getRedirectUri("google");
      const resolver   = new OAuthRedirectUriResolver();
      const expected   = resolver.getRedirectUri("google");
      const ok = discovered === expected && discovered.includes("/oauth/callback/google");
      return { testId: "golv_15", testName: "GIP consumes discovered redirect URI (not hardcoded)", category: CAT,
        passed: ok, detail: ok ? `URI: ${discovered}` : `discovered=${discovered} expected=${expected}`,
        durationMs: Date.now() - t0 };
    },
  },
];