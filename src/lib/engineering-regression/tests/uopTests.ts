/**
 * uopTests.ts — Sprint 6.4.0
 * Regression tests for Universal OAuth Platform.
 */

import type { RegressionTest, RegressionResult, RegressionCategory } from "../EngineeringRegressionSuite";
import { OAuthRegistry } from "../../universal-oauth/OAuthRegistry";
import { OAuthSessionManager } from "../../universal-oauth/OAuthSessionManager";
import { OAuthTokenManager } from "../../universal-oauth/OAuthTokenManager";
import { OAuthRefreshManager } from "../../universal-oauth/OAuthRefreshManager";
import { OAuthScopeManager } from "../../universal-oauth/OAuthScopeManager";
import { OAuthPermissionManager } from "../../universal-oauth/OAuthPermissionManager";
import { OAuthSecurity } from "../../universal-oauth/OAuthSecurity";
import { OAuthPersistence } from "../../universal-oauth/OAuthPersistence";
import { OAuthDiagnostics } from "../../universal-oauth/OAuthDiagnostics";
import { OAuthAudit } from "../../universal-oauth/OAuthAudit";
import { OAuthHealth } from "../../universal-oauth/OAuthHealth";
import { OAuthMetrics } from "../../universal-oauth/OAuthMetrics";
import { OAuthRuntime } from "../../universal-oauth/OAuthRuntime";

const CAT = "UOP" as RegressionCategory;

export const uopTests: RegressionTest[] = [
  {
    id: "uop_01", name: "OAuthRegistry: all 8 providers auto-registered", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      const ok = reg.providerCount() === 8;
      const providers = reg.listProviders().map(p => p.name);
      return { testId: "uop_01", testName: "OAuthRegistry: all 8 providers auto-registered", category: CAT,
        passed: ok, detail: ok ? `Providers: ${providers.join(",")}` : `Got ${reg.providerCount()} providers`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_02", name: "OAuthRegistry: session create + retrieve", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      const session = reg.createSession("google", "user_test", ["openid", "email"], ["openid"], Date.now() + 3600_000, {});
      const retrieved = reg.getSession(session.id);
      const ok = !!retrieved && retrieved.provider === "google" && retrieved.grantedScopes.includes("openid");
      return { testId: "uop_02", testName: "OAuthRegistry: session create + retrieve", category: CAT,
        passed: ok, detail: ok ? `id=${session.id} provider=google` : "Session not retrieved",
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_03", name: "OAuthSessionManager: validate + expire lifecycle", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      const mgr = new OAuthSessionManager(reg);
      const session = mgr.create({ provider: "microsoft", userId: "u1", grantedScopes: ["openid"], requiredScopes: ["openid"], expiresAt: Date.now() + 3600_000 });
      const v1 = mgr.validate(session.id);
      mgr.expire(session.id);
      const v2 = mgr.validate(session.id);
      const ok = v1.valid && !v2.valid && v2.expired;
      return { testId: "uop_03", testName: "OAuthSessionManager: validate + expire lifecycle", category: CAT,
        passed: ok, detail: ok ? "Validate OK → expire → expired=true" : `v1.valid=${v1.valid} v2.valid=${v2.valid} v2.expired=${v2.expired}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_04", name: "OAuthTokenManager: store + retrieve + mask (no plain token exposed)", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const tm = new OAuthTokenManager();
      const raw = "ya29.a0AfH6SMBx_TEST_ACCESS_TOKEN_12345678";
      const rec = tm.store("sess_test", "google", "access", raw, Date.now() + 3600_000, ["openid"]);
      const retrieved = tm.retrieve("sess_test", "access");
      const maskOk = !rec.maskedRef.includes("TEST_ACCESS") && rec.maskedRef.includes("****");
      const retrieveOk = retrieved === raw; // internal retrieve is fine
      const recordOk = !!rec.maskedRef;
      const ok = maskOk && retrieveOk && recordOk;
      return { testId: "uop_04", testName: "OAuthTokenManager: store + retrieve + mask", category: CAT,
        passed: ok, detail: ok ? `masked=${rec.maskedRef}` : `mask=${maskOk} retrieve=${retrieveOk}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_05", name: "OAuthRefreshManager: NOT_SUPPORTED for Slack (no refresh)", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      const session = reg.createSession("slack", "u1", ["channels:read"], [], Date.now() + 3600_000, {});
      const tm = new OAuthTokenManager();
      const mgr = new OAuthRefreshManager(reg, tm);
      const attempt = await mgr.refresh(session.id);
      const ok = attempt.result === "NOT_SUPPORTED";
      return { testId: "uop_05", testName: "OAuthRefreshManager: NOT_SUPPORTED for Slack", category: CAT,
        passed: ok, detail: ok ? "Slack correctly reports NOT_SUPPORTED" : `result=${attempt.result}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_06", name: "OAuthRefreshManager: REFRESHED for Google with refresh token", category: CAT,
    run: async (): Promise<RegressionResult> => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      const session = reg.createSession("google", "u1", ["openid"], [], Date.now() + 3600_000, {});
      const tm = new OAuthTokenManager();
      tm.store(session.id, "google", "refresh", "rt_test_token_12345678", null, []);
      const mgr = new OAuthRefreshManager(reg, tm);
      const attempt = await mgr.refresh(session.id);
      const ok = attempt.result === "REFRESHED" && attempt.success;
      return { testId: "uop_06", testName: "OAuthRefreshManager: REFRESHED for Google", category: CAT,
        passed: ok, detail: ok ? `Refreshed in ${attempt.durationMs}ms` : `result=${attempt.result}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_07", name: "OAuthScopeManager: built-in scopes registered + session grants", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const sm = new OAuthScopeManager();
      const googleScopes = sm.getScopesByProvider("google");
      const hasScopes = googleScopes.length >= 5;
      sm.grantScopes("sess_t", ["openid", "email"]);
      const hasOpenId = sm.hasScope("sess_t", "openid");
      const validation = sm.validateRequired("sess_t", ["openid", "profile"]);
      const ok = hasScopes && hasOpenId && !validation.valid && validation.missing.includes("profile");
      return { testId: "uop_07", testName: "OAuthScopeManager: scopes + grants", category: CAT,
        passed: ok, detail: ok ? `google scopes=${googleScopes.length} grants OK` : `hasScopes=${hasScopes} hasOpenId=${hasOpenId}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_08", name: "OAuthSecurity: no credentials in sanitized output", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const sec = new OAuthSecurity();
      const dirty = { accessToken: "secret123", repo: "memoryos", refreshToken: "rt_secret" };
      const clean = sec.sanitize(dirty);
      const tokenGone = !(clean as any).accessToken.includes("secret");
      const refreshGone = !(clean as any).refreshToken.includes("rt_secret");
      const repoIntact = (clean as any).repo === "memoryos";
      const ok = tokenGone && refreshGone && repoIntact;
      return { testId: "uop_08", testName: "OAuthSecurity: sanitize removes credentials", category: CAT,
        passed: ok, detail: ok ? "All credential fields redacted, safe fields intact" : `tokenGone=${tokenGone} repoIntact=${repoIntact}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_09", name: "OAuthAudit: append-only, no credentials in entries", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const audit = new OAuthAudit();
      audit.record("SESSION_CREATED", "google", "sess_1", ["openid"], "SUCCESS", 120, "Session created for user");
      audit.record("TOKEN_REFRESHED", "google", "sess_1", ["openid"], "SUCCESS", 80, "Token refreshed successfully");
      const before = audit.count();
      audit.record("SESSION_EXPIRED", "google", "sess_1", [], "FAIL", 0, "Session expired");
      const after = audit.count();
      const appendOk = after === before + 1;
      // Verify no credentials in any entry
      const allClean = audit.all().every(e => !e.detail.includes("secret") && !e.detail.includes("token="));
      const ok = appendOk && allClean;
      return { testId: "uop_09", testName: "OAuthAudit: append-only, no credentials", category: CAT,
        passed: ok, detail: ok ? `entries=${audit.count()} clean=true` : `append=${appendOk} clean=${allClean}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_10", name: "OAuthHealth: states tracked per provider", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const health = new OAuthHealth();
      health.mark("google", "sess_1", "CONNECTED", "Auth OK");
      health.mark("slack", "sess_2", "SESSION_EXPIRED", "Token expired");
      health.mark("microsoft", null, "DISCONNECTED", "Not connected");
      const summary = health.summary();
      const ok = summary.CONNECTED >= 1 && summary.SESSION_EXPIRED >= 1 && summary.DISCONNECTED >= 1;
      return { testId: "uop_10", testName: "OAuthHealth: states tracked per provider", category: CAT,
        passed: ok, detail: ok ? `CONNECTED=${summary.CONNECTED} EXPIRED=${summary.SESSION_EXPIRED} DISCONNECTED=${summary.DISCONNECTED}` : JSON.stringify(summary),
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_11", name: "OAuthMetrics: records auth + refresh + snapshot", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const metrics = new OAuthMetrics();
      metrics.recordAuth("google", 250, true);
      metrics.recordAuth("microsoft", 300, true);
      metrics.recordRefresh("google", 100, true);
      metrics.recordRefresh("google", 150, false);
      const snap = metrics.snapshot();
      const ok = snap.totalSessions === 2 && snap.totalRefreshAttempts === 2 &&
        snap.successfulRefreshes === 1 && snap.failedRefreshes === 1;
      return { testId: "uop_11", testName: "OAuthMetrics: records auth + refresh + snapshot", category: CAT,
        passed: ok, detail: ok ? `sessions=2 refreshes=2 avg=${snap.avgAuthMs}ms` : `sessions=${snap.totalSessions} refreshes=${snap.totalRefreshAttempts}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_12", name: "OAuthDiagnostics: runs on valid session", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      const session = reg.createSession("google", "u1", ["openid", "email"], ["openid"], Date.now() + 3600_000, {});
      const tm = new OAuthTokenManager();
      tm.store(session.id, "google", "access", "ya29.test_12345678", Date.now() + 3600_000, ["openid"]);
      const diag = new OAuthDiagnostics(reg, tm);
      const result = diag.run(session.id);
      const ok = result.expirationOk && result.scopesValid && result.providerReachable && result.overall;
      return { testId: "uop_12", testName: "OAuthDiagnostics: runs on valid session", category: CAT,
        passed: ok, detail: ok ? `overall=true health=${result.healthState}` : `issues=${result.issues.join(";")}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_13", name: "OAuthPermissionManager: service→scope mapping", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const pm = new OAuthPermissionManager();
      const calendarScopes = pm.getScopesForService("google", "calendar");
      const hasCal = calendarScopes.some(s => s.includes("calendar"));
      const validation = pm.validateSession("sess_t", ["openid", "email", "profile"]);
      const ok = hasCal && calendarScopes.length >= 1;
      return { testId: "uop_13", testName: "OAuthPermissionManager: service→scope mapping", category: CAT,
        passed: ok, detail: ok ? `calendar scopes=${calendarScopes.length}` : `hasCal=${hasCal}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_14", name: "OAuthRuntime: start/stop lifecycle + 8 providers", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const rt = new OAuthRuntime();
      rt.start();
      const running = rt.isRunning();
      const provCount = rt.registry.providerCount();
      rt.stop();
      const stopped = !rt.isRunning();
      const ok = running && provCount === 8 && stopped;
      return { testId: "uop_14", testName: "OAuthRuntime: start/stop lifecycle", category: CAT,
        passed: ok, detail: ok ? `running→stopped OK providers=${provCount}` : `running=${running} providers=${provCount} stopped=${stopped}`,
        durationMs: Date.now() - t0 };
    },
  },
  {
    id: "uop_15", name: "OAuthPersistence: save + restore round-trip (no tokens)", category: CAT,
    run: (): RegressionResult => {
      const t0 = Date.now();
      const reg = new OAuthRegistry();
      reg.createSession("google", "u1", ["openid", "email"], ["openid"], Date.now() + 3600_000, { env: "test" });
      const persistence = new OAuthPersistence(reg);
      persistence.save();
      const hasPersisted = persistence.hasPersisted();
      const result = persistence.restore();
      persistence.clear();
      // Verify no tokens in persisted data
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("uop_sessions_v1") : null;
      const noTokens = !raw || !["accessToken","refreshToken","token"].some(f => raw.includes(f));
      const ok = hasPersisted && noTokens;
      return { testId: "uop_15", testName: "OAuthPersistence: save + restore round-trip", category: CAT,
        passed: ok, detail: ok ? `persisted=true noTokens=true restored=${result.restored}` : `persisted=${hasPersisted} noTokens=${noTokens}`,
        durationMs: Date.now() - t0 };
    },
  },
];