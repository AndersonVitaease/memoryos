/**
 * gipTests.ts — Sprint 6.4.1
 * Regression tests for Google Identity Provider.
 */

import type { RegressionTest, RegressionResult, RegressionCategory } from "../EngineeringRegressionSuite";
import { GoogleIdentityProvider } from "../../google-identity/GoogleIdentityProvider";
import { GoogleOAuthAdapter } from "../../google-identity/GoogleOAuthAdapter";
import { GoogleScopeMapper } from "../../google-identity/GoogleScopeMapper";
import { GoogleAuthorizationFlow } from "../../google-identity/GoogleAuthorizationFlow";
import { GoogleSessionValidator } from "../../google-identity/GoogleSessionValidator";
import { GoogleRefreshHandler } from "../../google-identity/GoogleRefreshHandler";
import { GoogleDiagnostics } from "../../google-identity/GoogleDiagnostics";
import { GoogleAudit } from "../../google-identity/GoogleAudit";
import { GoogleMetrics } from "../../google-identity/GoogleMetrics";
import { GoogleHealth } from "../../google-identity/GoogleHealth";
import { UOP } from "../../universal-oauth/UniversalOAuthPlatform";

const CAT = "GIP" as RegressionCategory;

export const gipTests: RegressionTest[] = [
  {
    id: "gip_01", name: "Google provider registered in UOP", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const provider = new GoogleIdentityProvider();
      provider.register();
      const registered = provider.isRegistered();
      const config = provider.getConfig();
      const ok = registered && config.name === "google" && config.supportsRefresh;
      return { testId: "gip_01", testName: "Google provider registered in UOP", category: CAT,
        passed: ok, detail: ok ? `Provider registered, supportsRefresh=${config.supportsRefresh}` : "Provider not registered",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_02", name: "GoogleScopeMapper: identity scopes correct", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const mapper = new GoogleScopeMapper();
      const identity = mapper.getIdentityScopes();
      const hasAll = ["openid","email","profile"].every(s => identity.includes(s));
      const calScopes = mapper.getScopesForService("calendar");
      const hasCal = calScopes.some(s => s.includes("calendar"));
      const covered = mapper.getCoveredServices(["openid","email"]);
      const ok = hasAll && hasCal && covered.includes("identity");
      return { testId: "gip_02", testName: "GoogleScopeMapper: identity scopes correct", category: CAT,
        passed: ok, detail: ok ? `identity=${identity.join(",")} covered=${covered.join(",")}` : `hasAll=${hasAll} hasCal=${hasCal}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_03", name: "GoogleAuthorizationFlow: builds valid PKCE request", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const flow = new GoogleAuthorizationFlow();
      const { request, url } = flow.buildRequest("test_client_id", "https://app.example.com/callback");
      const urlOk = url.includes("accounts.google.com") && url.includes("code_challenge") && url.includes("openid");
      const stateOk = request.state.startsWith("state_");
      const verifierOk = request.codeVerifier.length >= 43;
      const ok = urlOk && stateOk && verifierOk;
      return { testId: "gip_03", testName: "GoogleAuthorizationFlow: builds valid PKCE request", category: CAT,
        passed: ok, detail: ok ? `URL valid, state=${request.state.slice(0,16)}... verifier=${request.codeVerifier.length}chars` : `urlOk=${urlOk} stateOk=${stateOk} verifierOk=${verifierOk}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_04", name: "GoogleAuthorizationFlow: state validation works", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const flow = new GoogleAuthorizationFlow();
      const state = "state_1234_abc";
      const validOk = flow.validateState(state, state);
      const invalidOk = !flow.validateState(state, "different_state");
      const ok = validOk && invalidOk;
      return { testId: "gip_04", testName: "GoogleAuthorizationFlow: state validation works", category: CAT,
        passed: ok, detail: ok ? "State validation correct" : `valid=${validOk} invalid=${invalidOk}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_05", name: "GoogleOAuthAdapter: simulated login creates active session", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      const result = await adapter.simulateLogin();
      const ok = result.success && !!result.session && result.session.state === "ACTIVE" &&
        !!result.userInfo && result.userInfo.email.length > 0;
      return { testId: "gip_05", testName: "GoogleOAuthAdapter: simulated login creates active session", category: CAT,
        passed: ok, detail: ok ? `Session ${result.session?.id} state=${result.session?.state} email=${result.userInfo?.email}` : `success=${result.success} error=${result.error}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_06", name: "GoogleSessionValidator: validates active session", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      const loginResult = await adapter.simulateLogin();
      if (!loginResult.session) {
        return { testId: "gip_06", testName: "GoogleSessionValidator: validates active session", category: CAT,
          passed: false, detail: "Login failed — cannot test validator", durationMs: Date.now() - t0 };
      }
      const validation = adapter.validate(loginResult.session.id);
      const ok = validation.valid && validation.sessionActive && validation.scopesGranted.length > 0;
      return { testId: "gip_06", testName: "GoogleSessionValidator: validates active session", category: CAT,
        passed: ok, detail: ok ? `valid=true scopes=${validation.scopesGranted.join(",")}` : `issues=${validation.issues.join(";")}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_07", name: "GoogleRefreshHandler: triggers via UOP refresh manager", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      const loginResult = await adapter.simulateLogin();
      if (!loginResult.session) {
        return { testId: "gip_07", testName: "GoogleRefreshHandler: triggers via UOP", category: CAT,
          passed: false, detail: "Login failed", durationMs: Date.now() - t0 };
      }
      const refreshed = await adapter.refresh(loginResult.session.id);
      // Refresh returns REFRESHED (has refresh token from simulated login)
      const ok = refreshed;
      return { testId: "gip_07", testName: "GoogleRefreshHandler: triggers via UOP", category: CAT,
        passed: ok, detail: ok ? "Token refreshed successfully" : "Refresh failed",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_08", name: "GoogleDiagnostics: runs on active session", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      const loginResult = await adapter.simulateLogin();
      const diag = adapter.diagnose(loginResult.session?.id);
      const ok = diag.oauthHealthy && (loginResult.session ? diag.sessionActive : true);
      return { testId: "gip_08", testName: "GoogleDiagnostics: runs on active session", category: CAT,
        passed: ok, detail: ok ? `overall=${diag.overall} active=${diag.sessionActive}` : `issues=${diag.issues.join(";")}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_09", name: "GoogleAudit: events append-only, no credentials", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const audit = new GoogleAudit();
      audit.record("LOGIN_INITIATED", "sess_1", ["openid"], "INFO", 0, "Login initiated");
      audit.record("LOGIN_COMPLETED", "sess_1", ["openid", "email"], "SUCCESS", 200, "Login successful");
      const before = audit.count();
      audit.record("TOKEN_REFRESHED", "sess_1", ["openid"], "SUCCESS", 100, "Refreshed");
      const after = audit.count();
      const appendOk = after === before + 1;
      const noTokens = audit.all().every(e =>
        !e.detail.toLowerCase().includes("access_token") &&
        !e.detail.toLowerCase().includes("refresh_token")
      );
      const ok = appendOk && noTokens;
      return { testId: "gip_09", testName: "GoogleAudit: events append-only, no credentials", category: CAT,
        passed: ok, detail: ok ? `entries=${audit.count()} clean=true` : `append=${appendOk} clean=${noTokens}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_10", name: "GoogleMetrics: records login + refresh + snapshot", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const metrics = new GoogleMetrics();
      metrics.recordLogin(250, true);
      metrics.recordLogin(300, false);
      metrics.recordRefresh(100, true);
      metrics.recordRefresh(150, false);
      const snap = metrics.snapshot();
      const ok = snap.totalLogins === 2 && snap.successfulLogins === 1 && snap.failedLogins === 1 &&
        snap.totalRefreshes === 2 && snap.successfulRefreshes === 1;
      return { testId: "gip_10", testName: "GoogleMetrics: records login + refresh + snapshot", category: CAT,
        passed: ok, detail: ok ? `logins=2 refreshes=2 avgLogin=${snap.avgLoginMs}ms` : `logins=${snap.totalLogins} refreshes=${snap.totalRefreshes}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_11", name: "GoogleHealth: state updates correctly", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const health = new GoogleHealth();
      health.update("HEALTHY", "Active session", "sess_1");
      const r1 = health.report();
      health.update("EXPIRED", "Token expired");
      const r2 = health.report();
      const ok = r1.state === "HEALTHY" && r2.state === "EXPIRED" && !health.isHealthy();
      return { testId: "gip_11", testName: "GoogleHealth: state updates correctly", category: CAT,
        passed: ok, detail: ok ? "HEALTHY → EXPIRED transitions correct" : `r1=${r1.state} r2=${r2.state}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_12", name: "GIP persistence: restore runs without error", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      adapter.initialize();
      // Simulate a session and save to persistence
      await adapter.simulateLogin();
      UOP.persistence.save();
      // Restore
      const result = adapter.restore();
      const ok = typeof result.restored === "number" && typeof result.skipped === "number";
      return { testId: "gip_12", testName: "GIP persistence: restore runs without error", category: CAT,
        passed: ok, detail: ok ? `restored=${result.restored} skipped=${result.skipped}` : "Restore threw",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_13", name: "GIP logout: session cleaned up in UOP", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      const loginResult = await adapter.simulateLogin();
      if (!loginResult.session) {
        return { testId: "gip_13", testName: "GIP logout: session cleaned up", category: CAT,
          passed: false, detail: "Login failed", durationMs: Date.now() - t0 };
      }
      const sessionId = loginResult.session.id;
      await adapter.logout(sessionId);
      const afterLogout = adapter.getSession(sessionId);
      const tokenGone = !UOP.tokenManager.isValid(sessionId, "access");
      const ok = afterLogout === null && tokenGone;
      return { testId: "gip_13", testName: "GIP logout: session cleaned up", category: CAT,
        passed: ok, detail: ok ? "Session and tokens cleaned up after logout" : `session=${!!afterLogout} tokenGone=${tokenGone}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "gip_14", name: "GIP no token exposed in public APIs", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();
      const loginResult = await adapter.simulateLogin();
      const session = loginResult.session;
      // Raw tokens must not appear in public-facing session fields
      const sessionStr = JSON.stringify(session);
      const noRawToken = !sessionStr.includes("ya29.demo") && !sessionStr.includes("1//demo_refresh");
      // Masked refs are ok
      const hasMaskedRef = session?.accessTokenRef?.includes("****") ?? false;
      const ok = noRawToken && hasMaskedRef;
      return { testId: "gip_14", testName: "GIP no token exposed in public APIs", category: CAT,
        passed: ok, detail: ok ? `Raw tokens not exposed, masked ref present: ${session?.accessTokenRef}` : `rawToken=${!noRawToken} maskedRef=${hasMaskedRef}`,
        durationMs: Date.now() - t0,
        rca: ok ? undefined : "GoogleOAuthAdapter.simulateLogin() is returning raw token values in session object" };
    },
  },
  {
    id: "gip_15", name: "Full GIP flow: login → validate → refresh → diagnose", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const adapter = new GoogleOAuthAdapter();

      const loginResult = await adapter.simulateLogin();
      if (!loginResult.success || !loginResult.session) {
        return { testId: "gip_15", testName: "Full GIP flow", category: CAT,
          passed: false, detail: "Login failed", durationMs: Date.now() - t0 };
      }

      const sessionId = loginResult.session.id;
      const validation = adapter.validate(sessionId);
      const refreshed = await adapter.refresh(sessionId);
      const diag = adapter.diagnose(sessionId);
      const metrics = adapter.metrics.snapshot();

      const ok = loginResult.success && validation.valid && refreshed && diag.oauthHealthy &&
        metrics.totalLogins >= 1 && metrics.successfulLogins >= 1;

      return { testId: "gip_15", testName: "Full GIP flow: login → validate → refresh → diagnose", category: CAT,
        passed: ok, detail: ok
          ? `login=✓ valid=✓ refresh=✓ diag=${diag.overall} logins=${metrics.totalLogins}`
          : `login=${loginResult.success} valid=${validation.valid} refresh=${refreshed} diag=${diag.overall}`,
        durationMs: Date.now() - t0 };
    },
  },
];